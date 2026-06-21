// Unified airdrop eligibility rubric for Base mainnet.
//
// Synthesized from historical L2 airdrops: Arbitrum (ARB), Optimism (OP),
// zkSync (ZK), and LayerZero (ZRO). Thresholds are scaled down vs. Ethereum
// L1 levels because Base mainnet gas is cheap and tx counts are typically
// higher per active user.

export type CriterionTier = {
  label: string
  threshold: number
  points: number
}

export type Criterion = {
  id: string
  name: string
  category: 'activity' | 'breadth' | 'capital' | 'longevity' | 'identity' | 'sybil'
  description: string
  inspiredBy: string[]
  tiers: CriterionTier[]
}

export const CRITERIA: Criterion[] = [
  {
    id: 'tx_count',
    name: 'Transaction count',
    category: 'activity',
    description: 'Total outgoing transactions on Base mainnet.',
    inspiredBy: ['Arbitrum (>=4 txs)', 'Optimism (>=4 txs)', 'zkSync (>=10 txs)'],
    tiers: [
      { label: '5+ txs', threshold: 5, points: 1 },
      { label: '25+ txs', threshold: 25, points: 2 },
      { label: '100+ txs', threshold: 100, points: 3 },
      { label: '500+ txs', threshold: 500, points: 4 },
    ],
  },
  {
    id: 'months_active',
    name: 'Distinct months active',
    category: 'activity',
    description: 'Number of distinct calendar months containing at least one tx.',
    inspiredBy: ['Arbitrum (2/6/9 months)', 'Optimism repeat-user', 'zkSync (>=3 months)'],
    tiers: [
      { label: '2+ months', threshold: 2, points: 1 },
      { label: '6+ months', threshold: 6, points: 2 },
      { label: '12+ months', threshold: 12, points: 3 },
      { label: '18+ months', threshold: 18, points: 4 },
    ],
  },
  {
    id: 'unique_contracts',
    name: 'Unique contracts touched',
    category: 'breadth',
    description: 'Distinct contract addresses interacted with.',
    inspiredBy: ['Arbitrum (>=4/>=10 contracts)', 'zkSync breadth bonus'],
    tiers: [
      { label: '4+ contracts', threshold: 4, points: 1 },
      { label: '10+ contracts', threshold: 10, points: 2 },
      { label: '25+ contracts', threshold: 25, points: 3 },
    ],
  },
  {
    id: 'eth_balance',
    name: 'ETH held on Base',
    category: 'capital',
    description: 'Current ETH balance on Base mainnet (in ETH).',
    inspiredBy: ['zkSync hold >=$50 for 3mo', 'Arbitrum bridged-volume tiers'],
    tiers: [
      { label: '0.01+ ETH', threshold: 0.01, points: 1 },
      { label: '0.1+ ETH', threshold: 0.1, points: 2 },
      { label: '1+ ETH', threshold: 1, points: 3 },
      { label: '2+ ETH', threshold: 2, points: 4 },
    ],
  },
  {
    id: 'wallet_age_days',
    name: 'Wallet age on Base (days)',
    category: 'longevity',
    description: 'Days since first tx on Base mainnet.',
    inspiredBy: ['Arbitrum pre-Nitro snapshot', 'Optimism pre-snapshot bonus'],
    tiers: [
      { label: '30+ days', threshold: 30, points: 1 },
      { label: '180+ days', threshold: 180, points: 2 },
      { label: '365+ days', threshold: 365, points: 3 },
    ],
  },
  {
    id: 'base_verify_identity',
    name: 'Base Verify identity',
    category: 'identity',
    description:
      'Verified social/identity proof via Base Verify (X Blue, Coinbase One, or Coinbase account).',
    inspiredBy: ['Base Verify (this repo)', 'zkSync crypto-native bonus (ENS, Gitcoin Passport)'],
    tiers: [
      { label: 'Verified Coinbase account', threshold: 1, points: 1 },
      { label: 'X Blue Checkmark', threshold: 2, points: 2 },
      { label: 'Coinbase One active', threshold: 3, points: 3 },
    ],
  },
  {
    id: 'basename',
    name: 'Owns a Basename',
    category: 'identity',
    description:
      'Wallet has a primary .base.eth name set. Strong identity signal — Basenames cost real money and identify a user.',
    inspiredBy: [
      'Optimism Gitcoin Passport / ENS bonus',
      'zkSync crypto-native bonus (ENS holders)',
    ],
    tiers: [
      { label: 'Owns a Basename', threshold: 1, points: 2 },
      { label: 'Owns a short Basename (≤6 chars)', threshold: 2, points: 3 },
    ],
  },
]

// Optional bonus criteria — only counted when the user opts in by providing
// a Base App / Smart Wallet address or an FID. Not deducted if absent.
export const BONUS_CRITERIA: Criterion[] = [
  {
    id: 'base_app_wallet',
    name: 'Linked Base App / Smart Wallet',
    category: 'identity',
    description:
      'Optional: paste your Base App embedded address. We detect smart-contract code and score its activity.',
    inspiredBy: ['Base App (Coinbase Smart Wallet)', 'ERC-4337 smart-account adoption signal'],
    tiers: [
      { label: 'Smart wallet detected', threshold: 1, points: 1 },
      { label: 'Smart wallet + active (≥5 txs)', threshold: 2, points: 2 },
      { label: 'Smart wallet + heavy use (≥25 txs)', threshold: 3, points: 3 },
    ],
  },
  {
    id: 'farcaster',
    name: 'Farcaster identity (via FID)',
    category: 'identity',
    description:
      'Optional: provide your Farcaster FID. We verify the wallet is in your verified addresses, then score by Power Badge / followers / FID age.',
    inspiredBy: [
      'Farcaster identity layer',
      'Gitcoin Passport (Optimism allocations)',
      'LayerZero quality-user signals',
    ],
    tiers: [
      { label: 'FID linked to wallet', threshold: 1, points: 1 },
      { label: '+ Power Badge or 1k+ followers', threshold: 2, points: 2 },
      { label: '+ Early FID (≤200k)', threshold: 3, points: 3 },
    ],
  },
]

// Sybil flags subtract points or disqualify entirely.
export type SybilFlag = {
  id: string
  name: string
  description: string
  inspiredBy: string[]
  severity: 'warning' | 'critical'
  penalty: number
}

export const SYBIL_FLAGS: SybilFlag[] = [
  {
    id: 'wallet_too_new',
    name: 'Wallet < 7 days old on Base',
    description: 'Sudden-arrival pattern common to airdrop farmers.',
    inspiredBy: ['LayerZero sniper filter', 'zkSync sybil cluster filter'],
    severity: 'warning',
    penalty: 1,
  },
  {
    id: 'no_activity',
    name: 'Zero transactions on Base',
    description: 'Wallet has never transacted on Base mainnet.',
    inspiredBy: ['Every L2 airdrop'],
    severity: 'critical',
    penalty: 99,
  },
  {
    id: 'single_day_burst',
    name: 'All activity within a single day',
    description: 'Months-active = 0 distinct calendar months despite tx count.',
    inspiredBy: ['Optimism repeat-user filter', 'zkSync pattern-similarity sybil'],
    severity: 'warning',
    penalty: 2,
  },
  {
    id: 'duplicate_base_verify_token',
    name: 'Identity already claimed from another wallet',
    description:
      'Base Verify token for this identity is already in the demo DB under a different wallet.',
    inspiredBy: ['Base Verify deterministic token (this repo)'],
    severity: 'critical',
    penalty: 99,
  },
]

export const MAX_SCORE = CRITERIA.reduce(
  (sum, c) => sum + Math.max(...c.tiers.map((t) => t.points)),
  0,
)

export function scoreTier(criterion: Criterion, value: number): { points: number; label: string } {
  let earned = { points: 0, label: 'Not met' }
  for (const tier of criterion.tiers) {
    if (value >= tier.threshold) earned = { points: tier.points, label: tier.label }
  }
  return earned
}

// Minimum eligibility rule — matches the pattern across ARB / OP / ZK / ZRO:
// every major L2 airdrop required (activity) AND (capital or identity or longevity).
// Never a single dimension. We mirror that here.
export const ACTIVITY_CRITERIA_IDS = ['tx_count', 'months_active', 'unique_contracts'] as const
export const COMMITMENT_CRITERIA_IDS = [
  'eth_balance',
  'base_verify_identity',
  'wallet_age_days',
  'basename',
] as const
