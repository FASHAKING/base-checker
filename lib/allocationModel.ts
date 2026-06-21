// Economic model for the /allocation page.
//
// Takes the unified eligibility score from /api/check-wallet and runs it
// through a tier-multiplier model to estimate $BASE allocation.
//
// All inputs are user-tunable on the page; the constants here are the
// realistic defaults used when no value is provided.

import { CheckerResult } from './baseChecker'

export type AllocationParams = {
  totalSupply: number      // total $BASE token supply
  airdropPct: number       // 0..1 — fraction of supply going to airdrop
  fdvUsd: number           // fully diluted valuation in USD
  eligibleWallets: number  // assumed total eligible wallets
  multipliers: Record<CheckerResult['tier'], number>
}

export const DEFAULT_PARAMS: AllocationParams = {
  totalSupply: 1_000_000_000,
  airdropPct: 0.10,
  fdvUsd: 3_000_000_000,
  eligibleWallets: 700_000,
  multipliers: {
    ineligible: 0,
    low: 0.25,
    medium: 1,
    high: 3,
    whale: 8,
  },
}

// Pre-baked scenarios users can one-click between.
// Numbers calibrated against actual L2 launches: ARB ($14B FDV → $4B now),
// OP ($8B → $6B), ZK ($5B → $1.3B), ZRO ($4.5B → $2.5B), STRK ($20B → $2B).
export const SCENARIOS: Record<string, Partial<AllocationParams> & { label: string; note: string }> = {
  bear: {
    label: 'Bear / sustained',
    note: 'Post-airdrop sell pressure has historically taken L2 tokens down 45–90% from launch. Models the realistic 6-month price.',
    fdvUsd: 1_000_000_000,
    eligibleWallets: 1_000_000,
  },
  base: {
    label: 'Base case',
    note: 'Default. FDV between JUP ($6.5B) and ZK ($5B). Reflects current market, not the 2023 launch peak.',
    fdvUsd: 3_000_000_000,
    eligibleWallets: 700_000,
  },
  bull: {
    label: 'Bull / launch day',
    note: 'Models a strong launch — closer to ZRO ($4.5B) or OP ($8B) launch FDV. Optimistic given current conditions.',
    fdvUsd: 6_000_000_000,
    eligibleWallets: 500_000,
  },
}

export type AllocationEstimate = {
  poolTokens: number       // total $BASE in the airdrop pool
  tokenPriceUsd: number    // FDV / supply
  baseAllocation: number   // pool / eligibleWallets (the "1x" allocation)
  tierMultiplier: number   // user's multiplier
  userTokens: number       // user's $BASE allocation
  userUsd: number          // user's allocation in USD
  poolUsd: number          // total pool in USD
}

export function estimateAllocation(
  result: Pick<CheckerResult, 'tier' | 'totalScore' | 'maxScore'>,
  params: AllocationParams,
): AllocationEstimate {
  const poolTokens = params.totalSupply * params.airdropPct
  const tokenPriceUsd = params.fdvUsd / params.totalSupply
  const baseAllocation = poolTokens / params.eligibleWallets
  const tierMultiplier = params.multipliers[result.tier] ?? 0

  // Within a tier, modulate by how deep into the tier the user scored.
  // Maps points → 0.7x..1.3x of the tier's base multiplier so two whales
  // with different point totals don't get the exact same number.
  const scorePct = result.totalScore / result.maxScore
  const inTierBonus =
    result.tier === 'ineligible' ? 1 : 0.7 + Math.min(1, scorePct) * 0.6

  const userTokens = baseAllocation * tierMultiplier * inTierBonus
  return {
    poolTokens,
    tokenPriceUsd,
    baseAllocation,
    tierMultiplier,
    userTokens,
    userUsd: userTokens * tokenPriceUsd,
    poolUsd: poolTokens * tokenPriceUsd,
  }
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`
  return n.toFixed(2)
}

export function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}
