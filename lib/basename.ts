// Basename + ENS resolution via the L1 ENS Universal Resolver (which delegates
// .base.eth lookups to Base L2 via CCIP-Read).
//
// Reliability strategy:
//   1. Fallback transport across multiple free public L1 RPCs so a single
//      flaky provider doesn't kill the feature.
//   2. In-memory result cache keyed by name/address so repeat lookups are
//      instant and we don't hammer upstream RPCs.

import { createPublicClient, fallback, http, isAddress, namehash } from 'viem'
import { mainnet, base } from 'viem/chains'

// Public L1 RPCs. Order matters — we try them top-to-bottom until one works.
// Add your own via L1_RPC_URL env to take precedence.
const L1_RPCS: string[] = [
  process.env.L1_RPC_URL || '',
  'https://eth.llamarpc.com',
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://cloudflare-eth.com',
  'https://1rpc.io/eth',
].filter(Boolean)

const l1Transport = fallback(
  L1_RPCS.map((url) => http(url, { timeout: 8_000 })),
  { rank: false, retryCount: 1 },
)

const ensClient = createPublicClient({ chain: mainnet, transport: l1Transport })

// Base mainnet — used as a backup path for reverse-resolution of .base.eth
// when L1 CCIP-Read paths fail. The Basenames L2 Reverse Resolver lives at
// the address below and exposes a `name(node)` function that maps the
// addr.reverse node to a human-readable name.
const baseClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org', {
    timeout: 8_000,
  }),
})

// Basenames L2 Resolver and Reverse Registrar addresses on Base mainnet.
// We try both because different Basenames deployment generations stored the
// reverse name in different contracts. Whichever returns first wins.
//
//   L2Resolver        — stores both forward (addr) AND reverse (name) records
//   ReverseRegistrar  — where users call setName(); forwards to L2Resolver
const BASE_L2_RESOLVER_CANDIDATES: `0x${string}`[] = [
  '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD', // L2 Resolver
  '0x79EA96012eEa67A83431F1701B3dFf7e37F9E282', // Reverse Registrar
]

const REVERSE_RESOLVER_ABI = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

// Build the reverse-lookup node for an address on Base: namehash("addr.80002105.reverse")
// 0x80002105 is Base mainnet's L2-prefixed coin type for ENSIP-19. We use the
// generic format the L2 Reverse Resolver expects.
function buildReverseNode(address: `0x${string}`): `0x${string}` {
  const stripped = address.toLowerCase().replace(/^0x/, '')
  return namehash(`${stripped}.80002105.reverse`) as `0x${string}`
}

// Simple per-process in-memory cache. Survives between requests in serverless
// warm starts; expires per entry.
type CacheEntry<T> = { value: T; expires: number }
const cache = new Map<string, CacheEntry<unknown>>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return undefined
  if (Date.now() > entry.expires) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function setCached<T>(key: string, value: T) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
}

export type BasenameInfo = {
  address: `0x${string}` | null
  name: string | null
  hasBasename: boolean
  handleLength: number | null
}

// Forward resolution: name → address.
export async function resolveAddressOrName(
  input: string,
): Promise<{ address: `0x${string}` | null; resolvedFrom: string | null }> {
  const trimmed = input.trim()
  if (isAddress(trimmed)) {
    return { address: trimmed.toLowerCase() as `0x${string}`, resolvedFrom: null }
  }
  if (!trimmed.includes('.')) return { address: null, resolvedFrom: null }

  const key = `name:${trimmed.toLowerCase()}`
  const cached = getCached<`0x${string}` | null>(key)
  if (cached !== undefined) {
    return cached
      ? { address: cached, resolvedFrom: trimmed }
      : { address: null, resolvedFrom: null }
  }

  try {
    const addr = await ensClient.getEnsAddress({ name: trimmed.toLowerCase() })
    const result = addr ? (addr.toLowerCase() as `0x${string}`) : null
    setCached(key, result)
    return result
      ? { address: result, resolvedFrom: trimmed }
      : { address: null, resolvedFrom: null }
  } catch {
    // Don't cache failures so we retry next time
    return { address: null, resolvedFrom: null }
  }
}

// Reverse resolution: address → primary .base.eth (or ENS) name.
// Tries L1 Universal Resolver first (handles .base.eth via CCIP-Read), then
// falls back to a direct call to the Base L2 Reverse Resolver if L1 fails.
export async function lookupBasename(address: `0x${string}`): Promise<BasenameInfo> {
  const info: BasenameInfo = {
    address,
    name: null,
    hasBasename: false,
    handleLength: null,
  }

  const key = `addr:${address.toLowerCase()}`
  const cached = getCached<BasenameInfo>(key)
  if (cached) return cached

  // Path 1: L1 ENS reverse (covers .eth and .base.eth via CCIP-Read).
  try {
    const name = await ensClient.getEnsName({ address })
    if (name) applyName(info, name)
  } catch {
    // fall through to Base L2
  }

  // Path 2 alt: Coinbase's public Basenames API. Cheap, no contract calls,
  // and respects the user's actual "Set as Primary" action on base.org.
  if (!info.hasBasename) {
    try {
      const res = await fetch(
        `https://www.base.org/api/basenames/${address.toLowerCase()}`,
        { headers: { Accept: 'application/json' } },
      )
      if (res.ok) {
        const data = (await res.json()) as { name?: string; basename?: string }
        const name = data?.basename || data?.name
        if (name) applyName(info, name)
      }
    } catch {
      // network blocked or endpoint changed; fall through to direct contract call
    }
  }

  // Path 3: Direct query of the Base L2 Resolver / Reverse Registrar.
  // Try each candidate; first non-empty .base.eth wins. Done even when L1
  // returned a non-base name, because L1 primary and Base primary are
  // separate records (setting one does NOT update the other).
  if (!info.hasBasename) {
    try {
      const node = buildReverseNode(address)
      for (const contract of BASE_L2_RESOLVER_CANDIDATES) {
        try {
          const name = (await baseClient.readContract({
            address: contract,
            abi: REVERSE_RESOLVER_ABI,
            functionName: 'name',
            args: [node],
          })) as string
          if (name && name.length > 0) {
            applyName(info, name)
            if (info.hasBasename) break
          }
        } catch {
          // try next candidate
        }
      }
    } catch {
      // graceful fail; basename bonus simply skipped
    }
  }

  setCached(key, info)
  return info
}

function applyName(info: BasenameInfo, name: string) {
  info.name = name
  if (name.toLowerCase().endsWith('.base.eth')) {
    info.hasBasename = true
    const handle = name.replace(/\.base\.eth$/i, '')
    info.handleLength = handle.length > 0 ? handle.length : null
  }
}
