// Ownership check for the "Farcaster Pro OG" NFT.
//
// The NFT (symbol: FCPRO) is an ERC-1155 minted to the first 10,000 Farcaster
// Pro subscribers. Contract on Base mainnet.
//
// Because the user might hold the NFT on any of several related addresses —
// the queried wallet, a linked Base App / Smart Wallet, the FID's custody
// address, or any of the FID's verified Ethereum addresses — we accept a list
// of candidate addresses and report the first one that holds it.

import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

export const FCPRO_CONTRACT = '0x61886e7d61f4086ada1829880af440aa0de3fc96' as const
const FCPRO_TOKEN_ID = BigInt(1)

const FCPRO_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org', {
    timeout: 8_000,
  }),
})

export type FcproOwnership = {
  owned: boolean
  ownerAddress: `0x${string}` | null
  checkedAddresses: `0x${string}`[]
}

// Dedupe + normalize candidate addresses, then check balanceOf on each in
// parallel. First non-zero balance wins; we report which address held it.
export async function checkFarcasterProOg(
  candidates: (string | null | undefined)[],
): Promise<FcproOwnership> {
  const seen = new Set<string>()
  const addresses: `0x${string}`[] = []
  for (const c of candidates) {
    if (!c) continue
    const lower = c.toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(lower)) continue
    if (seen.has(lower)) continue
    seen.add(lower)
    addresses.push(lower as `0x${string}`)
  }
  if (addresses.length === 0) {
    return { owned: false, ownerAddress: null, checkedAddresses: [] }
  }

  const balances = await Promise.all(
    addresses.map((addr) =>
      client
        .readContract({
          address: FCPRO_CONTRACT,
          abi: FCPRO_ABI,
          functionName: 'balanceOf',
          args: [addr, FCPRO_TOKEN_ID],
        })
        .then((b) => b as bigint)
        .catch(() => BigInt(0)),
    ),
  )

  for (let i = 0; i < addresses.length; i++) {
    if (balances[i] > BigInt(0)) {
      return { owned: true, ownerAddress: addresses[i], checkedAddresses: addresses }
    }
  }
  return { owned: false, ownerAddress: null, checkedAddresses: addresses }
}
