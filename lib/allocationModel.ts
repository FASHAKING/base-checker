// Economic model for the /allocation page.
//
// Honest design choice: we DO NOT estimate "how many wallets are eligible"
// because that requires indexing every wallet on Base. Instead we anchor on
// "what does a max-score user get" (whaleAnchorUsd) and scale every other
// user by their score ratio. The pool size and the user's share of the pool
// become informational — never an input we have to guess.
//
// Curve exponent shapes the distribution:
//   1.0 = linear (medium gets 50% of whale)
//   1.5 = mild whale skew (medium gets 35% of whale) — DEFAULT, matches ARB
//   2.0 = strong whale skew (medium gets 25% of whale)

import { CheckerResult } from './baseChecker'

export type AllocationParams = {
  totalSupply: number          // total $BASE token supply
  airdropPct: number           // 0..1 — fraction of supply going to airdrop
  fdvUsd: number               // fully diluted valuation in USD
  floorTokens: number          // $BASE a minimum-eligible user receives (hard FLOOR)
  whaleAnchorTokens: number    // $BASE a max-score user receives (hard CAP)
  curveExponent: number        // 1.0 = linear, 1.5 = mild whale skew
  farcasterBoostPct: number    // 0..1 — multiplicative boost when FID is linked.
                               //         Scales with Farcaster bonus points (0/1/2/3).
                               //         Applied before the cap, so cap still binds.
}

export const DEFAULT_PARAMS: AllocationParams = {
  totalSupply: 10_000_000_000,
  airdropPct: 0.12,
  fdvUsd: 12_000_000_000,
  floorTokens: 500,
  whaleAnchorTokens: 25_000,
  curveExponent: 1.5,
  farcasterBoostPct: 0.20,
}

// Anchor pool used to scale floor/cap proportionally. With defaults:
//   anchorPool = 10B × 25% = 2.5B → floor 500 / cap 25,000
// When the user changes supply or airdrop%, the effective floor and cap
// scale by (currentPool / anchorPool) so allocations move in proportion
// with the pool size, matching real-drop intuition.
export const ANCHOR_POOL = DEFAULT_PARAMS.totalSupply * DEFAULT_PARAMS.airdropPct

// Real-world anchor: top-tier users in past drops received roughly:
//   ARB top: ~10,200 ARB × $1.40 = ~$14,000 (most top users got $3-6k)
//   OP top: ~27,500 OP × $1.80 ≈ $49,500 (outliers; median power user ~$3-8k)
//   ZRO top: ~5,000 ZRO × $4.50 = ~$22,500 (median ~$3-8k)
//   ZK top: ~50,000 ZK × $0.22 ≈ $11,000 (median ~$2-5k)
// Default $5k whale anchor matches the median power-user payout, not the
// outlier-whale payout. Users can push it up to model the latter.

export const SCENARIOS: Record<
  string,
  Partial<AllocationParams> & { label: string; note: string }
> = {
  bear: {
    label: 'Bear / sustained',
    note: 'Modest distribution + lower FDV. 10k $BASE cap = ARB-modal whale tier — the "iconic 10k" reference point.',
    fdvUsd: 1_000_000_000,
    floorTokens: 250,
    whaleAnchorTokens: 10_000,
    farcasterBoostPct: 0.15,
  },
  base: {
    label: 'Base case',
    note: 'Default ✨. 25k $BASE cap sits between ARB (10k) and OP (27.5k) — feels earned, has precedent.',
    fdvUsd: 12_000_000_000,
    floorTokens: 500,
    whaleAnchorTokens: 25_000,
    farcasterBoostPct: 0.20,
  },
  bull: {
    label: 'Bull / launch day',
    note: 'Strong launch. 50k $BASE cap matches STRK\'s actual top tier — generous but real.',
    fdvUsd: 6_000_000_000,
    floorTokens: 1_000,
    whaleAnchorTokens: 50_000,
    farcasterBoostPct: 0.25,
  },
}

export type AllocationEstimate = {
  eligible: boolean
  failureReasons: string[]
  poolTokens: number             // total $BASE in airdrop pool (informational)
  poolUsd: number                // pool in USD (informational)
  tokenPriceUsd: number          // FDV / supply
  floorTokens: number            // hard floor — min eligible user gets this
  whaleAnchorTokens: number      // hard cap — max-score user gets this
  scoreRatio: number             // userScore / maxScore
  curveMultiplier: number        // scoreRatio ^ curveExponent (before clamp)
  baseCurveTokens: number        // tokens from curve only (pre-boost, pre-clamp)
  farcasterBoostMultiplier: number  // 1 + boost × (fcPts/3); 1.0 = no boost
  boostedTokens: number          // baseCurveTokens × farcasterBoostMultiplier
  hitFloor: boolean              // was the user pushed up to the floor?
  hitCap: boolean                // was the user pushed down to the cap?
  userTokens: number             // user's final $BASE allocation (after floor/cap)
  userUsd: number                // user's allocation in USD
  poolSharePct: number           // userTokens / poolTokens × 100
}

export function estimateAllocation(
  result: Pick<
    CheckerResult,
    'totalScore' | 'maxScore' | 'minimumEligibility' | 'bonusMetrics'
  >,
  params: AllocationParams,
): AllocationEstimate {
  const poolTokens = params.totalSupply * params.airdropPct
  const tokenPriceUsd = params.fdvUsd / params.totalSupply
  const poolUsd = poolTokens * tokenPriceUsd
  // Scale floor/cap proportionally with pool size. If the user doubles
  // supply or airdrop %, the pool doubles, so allocations double too.
  // FDV changes only affect USD value, not token count.
  const poolRatio = ANCHOR_POOL > 0 ? poolTokens / ANCHOR_POOL : 1
  const whaleAnchorTokens = params.whaleAnchorTokens * poolRatio
  const floorTokens = params.floorTokens * poolRatio

  // Farcaster boost: scales with how many Farcaster points the user earned (0..3 → 0..1).
  // Defaults to 1.0× when no FID provided or wallet not linked.
  const farcasterMetric = result.bonusMetrics.find((m) => m.id === 'farcaster')
  const farcasterPts = farcasterMetric?.pointsEarned ?? 0
  const farcasterMaxPts = farcasterMetric?.maxPoints ?? 3
  const farcasterBoostMultiplier =
    farcasterMaxPts > 0
      ? 1 + params.farcasterBoostPct * (farcasterPts / farcasterMaxPts)
      : 1

  if (!result.minimumEligibility.meets) {
    return {
      eligible: false,
      failureReasons: result.minimumEligibility.failureReasons,
      poolTokens,
      poolUsd,
      tokenPriceUsd,
      floorTokens,
      whaleAnchorTokens,
      scoreRatio: 0,
      curveMultiplier: 0,
      baseCurveTokens: 0,
      farcasterBoostMultiplier,
      boostedTokens: 0,
      hitFloor: false,
      hitCap: false,
      userTokens: 0,
      userUsd: 0,
      poolSharePct: 0,
    }
  }

  const scoreRatio = result.maxScore > 0 ? result.totalScore / result.maxScore : 0
  const curveMultiplier = Math.pow(scoreRatio, params.curveExponent)
  const baseCurveTokens = whaleAnchorTokens * curveMultiplier
  const boostedTokens = baseCurveTokens * farcasterBoostMultiplier

  // Clamp between floor and cap (matches ARB/OP/ZK/ZRO design pattern).
  // The Farcaster boost can push you toward the cap but never past it.
  const userTokens = Math.min(whaleAnchorTokens, Math.max(floorTokens, boostedTokens))
  const hitFloor = boostedTokens < floorTokens
  const hitCap = boostedTokens > whaleAnchorTokens

  const userUsd = userTokens * tokenPriceUsd
  const poolSharePct = poolTokens > 0 ? (userTokens / poolTokens) * 100 : 0

  return {
    eligible: true,
    failureReasons: [],
    poolTokens,
    poolUsd,
    tokenPriceUsd,
    floorTokens,
    whaleAnchorTokens,
    scoreRatio,
    curveMultiplier,
    baseCurveTokens,
    farcasterBoostMultiplier,
    boostedTokens,
    hitFloor,
    hitCap,
    userTokens,
    userUsd,
    poolSharePct,
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
