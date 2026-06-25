# Base Airdrop Checker

A unified eligibility checker and allocation estimator for **Base mainnet** wallets, synthesizing patterns from the four largest L2 airdrops (ARB, OP, ZK, ZRO) plus the Base Verify identity layer.

Paste any address (or connect a wallet) at `/checker` to get a score; pipe that score through `/allocation` to estimate a $BASE allocation in tokens and USD.

---

## What the checker measures

Six core criteria (1–3 points each, **18 pts max**) plus optional bonus criteria (+9 pts → **27 pts total**).

### Core criteria

| # | Criterion | Category | Tiers (1 / 2 / 3 pts) | Inspired by |
|---|---|---|---|---|
| 1 | Transaction count | Activity | ≥5 / 25 / 100 | Arbitrum (≥4 txs), Optimism, zkSync (≥10 txs) |
| 2 | Distinct months active | Activity | ≥2 / 6 / 12 | Arbitrum tiered months, zkSync (≥3 months) |
| 3 | Unique contracts touched | Breadth | ≥4 / 10 / 25 | Arbitrum (≥4/≥10 contracts), zkSync breadth bonus |
| 4 | ETH held on Base | Capital | ≥0.01 / 0.1 / 1 | zkSync hold ≥$50, Arbitrum bridged-volume tiers |
| 5 | Wallet age in days | Longevity | ≥30 / 180 / 365 | Arbitrum Nitro snapshot, Optimism pre-snapshot bonus |
| 6 | Base Verify identity | Identity | verified trait tiers | Base Verify + zkSync crypto-native bonus |

### Bonus criteria (opt-in, never penalize)

| # | Criterion | Tiers (1 / 2 / 3 pts) |
|---|---|---|
| 7 | Linked Base App / Smart Wallet | detected / 5+ txs / 25+ txs |
| 8 | Base mini app engagement | 1+ / 3+ / 5+ apps |
| 9 | Farcaster identity (via FID) | linked / + Power Badge or 1k+ followers / + early FID ≤200k |

### Sybil penalties

| Flag | Severity |
|---|---|
| Zero txs on Base | Critical (-99, ineligible) |
| Wallet < 7 days old | Warning (-1) |
| All activity in a single calendar month despite ≥5 txs | Warning (-2) |
| Identity already claimed from another wallet | Critical (-99, ineligible) |

### Tiers

- `0 pts` → **Ineligible**
- `1–8 pts` → **Low**
- `9–14 pts` → **Medium**
- `15–20 pts` → **High**
- `21–24 pts` → **Whale**

---

## $BASE Allocation Estimator

### Minimum eligibility (hard gate)

Must pass **all three**:

1. **≥1 activity criterion** — tx count, months active, or unique contracts
2. **≥1 commitment criterion** — ETH balance, Base Verify identity, or wallet age
3. **No critical sybil flags**

Single-criterion wallets ("I hold 1 ETH but never used Base") fail. So do one-day-burst farmers.

### Base allocation and max

- **Floor: 500 $BASE** — hard floor in tokens. Real floors: ARB 1,250 · OP 250 · ZK 450 · ZRO 50 · STRK 300.
- **Whale cap: 25,000 $BASE** — hard cap in tokens. Sits between ARB (10,250) and OP (27,500). Realistic and friendly, with direct precedent.

Both floor and cap exist because every successful L2 drop bounded allocations on both ends:
- **Cap** kills sybil farming incentives and prevents whales from draining the pool.
- **Floor** makes passing eligibility mean something — bottom-tier qualifying users get a real allocation, not dust.

### Total supply and FDV

| Parameter | Default | How we got there |
|---|---|---|
| **Total supply** | **10,000,000,000 $BASE** | Matches ARB, STRK, and JUP — the standard L2/major-token supply. Keeps token price sub-$1, which is realistic for L2 launches and avoids the optics problem of a "premium" launch price. |
| **FDV at launch** | **$9,000,000,000** | Above JUP ($6.5B) and ZK ($5B), closer to OP ($8B) territory. With 10B supply this implies **$0.90/token**. |
| **Airdrop %** | 15% | Closer to ZK's 17.5% than ARB's 11.62% — reflects Base's larger active-user base and identity-layer reach. |
| **Curve exponent** | 1.5 | Mild whale skew; a 50%-score user gets ~35% of whale tokens. ARB's actual curve was closer to 1.8. |
| **Farcaster boost** | 20% | Multiplicative bonus when FID is linked. 0% (no penalty) without. |

Calibrated against actual L2 launches: ARB ($1.40 launch / $14B FDV → $0.40 now), OP ($1.80 / $8B → $1.50), ZK ($0.22 / $5B → $0.06), ZRO ($4.50 / $4.5B → $2.50), STRK ($2.00 / $20B → $0.20). L2 tokens have historically lost 45–90% within months of launch — the 10B supply / $3B FDV defaults assume a realistic post-launch market, not peak hype.

### Scenarios (preset on the page)

| Scenario | FDV | Token price | Floor | Cap | Whale USD |
|---|---|---|---|---|---|
| **Bear** | $3B | $0.30 | 250 | 10,000 | ~$3,000 |
| **Base case** | $9B | $0.90 | 500 | 25,000 | ~$22,500 |
| **Bull** | $15B | $1.50 | 1,000 | 50,000 | ~$75,000 |

### Allocation formula

```
# 1. Gate
if !meetsMinimum: return 0

# 2. Economics
tokenPrice  = FDV / totalSupply
floorTokens = floorUsd / tokenPrice
whaleTokens = whaleAnchorUsd / tokenPrice           # hard cap

# 3. Score-based scaling
scoreRatio      = userScore / maxScore
curveMultiplier = scoreRatio ^ curveExponent        # 1.5 default
baseCurveTokens = whaleTokens × curveMultiplier

# 4. Optional Farcaster boost (multiplicative)
fcBoostMult   = 1 + farcasterBoostPct × (fcPts / 3) # 20% default
boostedTokens = baseCurveTokens × fcBoostMult

# 5. Clamp
userTokens = min(whaleTokens, max(floorTokens, boostedTokens))
userUsd    = userTokens × tokenPrice
```

### Default math walk-through

With base case defaults (10B supply, $9B FDV, $0.90/token, floor 500, cap 25,000, exponent 1.5):

| Score % | After clamp | USD @ $0.90 |
|---|---|---|
| 0% (fails eligibility) | 0 $BASE | $0 |
| ~6% (kink) | 500 $BASE (floor) | $450 |
| 25% | 3,125 $BASE | $2,813 |
| 50% | 8,839 $BASE | $7,955 |
| 75% | 16,238 $BASE | $14,614 |
| 100% | 25,000 $BASE (cap) | $22,500 |
| 100% + max Farcaster boost | 25,000 $BASE (cap) | $22,500 |

Anyone below ~6% of max gets the floor. Above that they scale up the curve. At 100% they hit the cap — even Farcaster boosters get clamped there.
