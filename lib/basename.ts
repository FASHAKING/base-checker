// Basename (and ENS) resolution + reverse lookup via L1 mainnet client.
//
// .base.eth names are L2 names resolved through L1 ENS Universal Resolver via
// CCIP-Read. viem handles this transparently when given a mainnet client.

import { createPublicClient, http, isAddress } from 'viem'
import { mainnet } from 'viem/chains'

// CCIP-Read for .base.eth requires an L1 RPC that follows the OffchainLookup
// revert and supports the off-chain gateway redirect. Cloudflare's public RPC
// works reliably for this. Override with L1_RPC_URL env var for production.
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.L1_RPC_URL || 'https://cloudflare-eth.com'),
})

export type BasenameInfo = {
  address: `0x${string}` | null
  name: string | null
  // For scoring: true if the primary name is a .base.eth name
  hasBasename: boolean
  // For tier-2: short Basename (handle without .base.eth ≤ 6 chars)
  isShortBasename: boolean
}

// Resolve an input that may be either a 0x address or `name.base.eth` / `name.eth`.
// Returns the resolved address, or null if invalid / can't resolve.
export async function resolveAddressOrName(
  input: string,
): Promise<{ address: `0x${string}` | null; resolvedFrom: string | null }> {
  const trimmed = input.trim()
  if (isAddress(trimmed)) {
    return { address: trimmed.toLowerCase() as `0x${string}`, resolvedFrom: null }
  }
  if (trimmed.includes('.')) {
    try {
      const addr = await ensClient.getEnsAddress({ name: trimmed.toLowerCase() })
      return addr ? { address: addr.toLowerCase() as `0x${string}`, resolvedFrom: trimmed } : { address: null, resolvedFrom: null }
    } catch {
      return { address: null, resolvedFrom: null }
    }
  }
  return { address: null, resolvedFrom: null }
}

export async function lookupBasename(address: `0x${string}`): Promise<BasenameInfo> {
  const info: BasenameInfo = {
    address,
    name: null,
    hasBasename: false,
    isShortBasename: false,
  }
  try {
    const name = await ensClient.getEnsName({ address })
    if (name) {
      info.name = name
      if (name.endsWith('.base.eth')) {
        info.hasBasename = true
        const handle = name.replace(/\.base\.eth$/i, '')
        info.isShortBasename = handle.length > 0 && handle.length <= 6
      }
    }
  } catch {
    // graceful fail — Basename bonus simply skipped
  }
  return info
}
