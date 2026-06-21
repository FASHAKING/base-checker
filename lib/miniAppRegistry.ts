// Curated registry of known Base mini app contract addresses on mainnet.
//
// HOW THIS IS USED: /api/check-wallet counts how many of these contracts a
// wallet (or its linked Base App Smart Wallet) has interacted with. Each
// distinct contract = +1 toward the "Base mini app engagement" criterion.
//
// HOW TO POPULATE: drop in real Base mainnet contract addresses for the mini
// apps you want to credit users for. Examples of what to add:
//   - The main entry contract of a Base mini app (the address users `to:`)
//   - Token/NFT contracts deployed by a mini app
//   - Router contracts a mini app proxies through
//
// SHIP-IT NOTE: this list is intentionally empty in the demo because I
// shouldn't fabricate addresses. The /checker page will surface "0 mini apps"
// until you populate it — that's the honest signal.
//
// EXTENSION IDEAS:
//   - Pull this list from a hosted JSON (e.g. mini-app-registry.basescan.dev)
//   - Allow per-app weights (some mini apps could be worth more credit)
//   - Add Farcaster FID + Neynar API path for off-chain mini app usage

export type MiniAppEntry = {
  name: string
  address: `0x${string}`
  category?: string
}

export const MINI_APP_REGISTRY: MiniAppEntry[] = [
  // Example shape — replace with real addresses before relying on the score:
  // { name: 'Friend Tech Base', address: '0x...', category: 'social' },
  // { name: 'Talent Protocol', address: '0x...', category: 'identity' },
]
