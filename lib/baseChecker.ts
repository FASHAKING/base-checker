import { createPublicClient, http, formatEther, isAddress } from 'viem'
import { base } from 'viem/chains'
import { config } from './config'
import prisma from './prisma'
import { CRITERIA, SYBIL_FLAGS, MAX_SCORE, scoreTier } from './baseCheckerCriteria'

const publicClient = createPublicClient({
  chain: base,
  transport: http(config.baseMainnetRpcUrl),
})

type BasescanTx = {
  hash: string
  from: string
  to: string
  timeStamp: string
  blockNumber: string
  isError: string
}

async function basescanTxList(address: string): Promise<BasescanTx[] | null> {
  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'asc',
    page: '1',
    offset: '10000',
  })
  if (config.basescanApiKey) params.set('apikey', config.basescanApiKey)

  try {
    const res = await fetch(`${config.basescanApiUrl}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== '1' || !Array.isArray(data.result)) {
      // status "0" with empty result is a valid "no txs" response
      if (data.message === 'No transactions found') return []
      return null
    }
    return data.result as BasescanTx[]
  } catch {
    return null
  }
}

export type CheckerMetric = {
  id: string
  name: string
  category: string
  value: number
  displayValue: string
  tierLabel: string
  pointsEarned: number
  maxPoints: number
  inspiredBy: string[]
}

export type CheckerSybilHit = {
  id: string
  name: string
  description: string
  severity: 'warning' | 'critical'
  penalty: number
}

export type CheckerResult = {
  address: string
  totalScore: number
  maxScore: number
  tier: 'ineligible' | 'low' | 'medium' | 'high' | 'whale'
  metrics: CheckerMetric[]
  sybilFlags: CheckerSybilHit[]
  identity: {
    hasBaseVerify: boolean
    provider: string | null
    tokenTaken: boolean
  }
  dataSources: {
    rpc: boolean
    basescan: boolean
  }
  warnings: string[]
}

function tierFromScore(score: number, max: number): CheckerResult['tier'] {
  const pct = score / max
  if (score <= 0) return 'ineligible'
  if (pct >= 0.85) return 'whale'
  if (pct >= 0.6) return 'high'
  if (pct >= 0.35) return 'medium'
  return 'low'
}

function distinctMonths(timestamps: number[]): number {
  const months = new Set<string>()
  for (const ts of timestamps) {
    const d = new Date(ts * 1000)
    months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
  }
  return months.size
}

export async function checkWallet(addressRaw: string): Promise<CheckerResult> {
  if (!isAddress(addressRaw)) throw new Error('Invalid address')
  const address = addressRaw.toLowerCase() as `0x${string}`
  const warnings: string[] = []

  // 1. RPC checks (always available)
  let balanceWei = BigInt(0)
  let txCountFromRpc = 0
  let rpcOk = true
  try {
    ;[balanceWei, txCountFromRpc] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.getTransactionCount({ address }),
    ])
  } catch (err) {
    rpcOk = false
    warnings.push('Base mainnet RPC call failed; balance and tx count unavailable.')
  }
  const ethBalance = parseFloat(formatEther(balanceWei))

  // 2. BaseScan checks (optional, indexer-backed)
  let txList: BasescanTx[] | null = null
  let basescanOk = false
  if (config.basescanApiKey || true) {
    txList = await basescanTxList(address)
    basescanOk = txList !== null
    if (!basescanOk) {
      warnings.push(
        'BaseScan API unreachable or rate-limited. Months-active, contract breadth, and wallet age fall back to coarse estimates.',
      )
    }
  } else {
    warnings.push('BASESCAN_API_KEY not configured; skipping indexer-backed metrics.')
  }

  const successfulOutgoingTxs = (txList ?? []).filter(
    (t) => t.from.toLowerCase() === address && t.isError === '0',
  )
  const txCount = basescanOk ? successfulOutgoingTxs.length : txCountFromRpc
  const months = basescanOk
    ? distinctMonths(successfulOutgoingTxs.map((t) => parseInt(t.timeStamp, 10)))
    : 0
  const uniqueContracts = basescanOk
    ? new Set(successfulOutgoingTxs.map((t) => t.to.toLowerCase()).filter(Boolean)).size
    : 0
  const firstTs = basescanOk && successfulOutgoingTxs[0]
    ? parseInt(successfulOutgoingTxs[0].timeStamp, 10)
    : 0
  const walletAgeDays = firstTs ? Math.floor((Date.now() / 1000 - firstTs) / 86400) : 0

  // 3. Identity check via Base Verify token in this repo's DB
  let hasBaseVerify = false
  let tokenTaken = false
  let identityValue = 0
  let identityProvider: string | null = null
  try {
    const user = await prisma.verifiedUser.findUnique({ where: { address } })
    if (user?.baseVerifyToken) {
      hasBaseVerify = true
      identityValue = 1
      identityProvider = 'coinbase'
    } else {
      const sameToken = await prisma.verifiedUser.findFirst({
        where: { address: { not: address } },
      })
      if (sameToken === null) {
        // pass
      }
    }
  } catch {
    warnings.push('Identity DB check skipped (Prisma unavailable).')
  }

  // 4. Compute scores per criterion
  const valueByCriterion: Record<string, { value: number; display: string }> = {
    tx_count: { value: txCount, display: `${txCount} txs` },
    months_active: { value: months, display: basescanOk ? `${months} months` : 'n/a' },
    unique_contracts: {
      value: uniqueContracts,
      display: basescanOk ? `${uniqueContracts} contracts` : 'n/a',
    },
    eth_balance: { value: ethBalance, display: `${ethBalance.toFixed(4)} ETH` },
    wallet_age_days: {
      value: walletAgeDays,
      display: basescanOk ? `${walletAgeDays} days` : 'n/a',
    },
    base_verify_identity: {
      value: identityValue,
      display: hasBaseVerify ? `Verified (${identityProvider})` : 'Not verified',
    },
  }

  const metrics: CheckerMetric[] = CRITERIA.map((c) => {
    const v = valueByCriterion[c.id]
    const tier = scoreTier(c, v.value)
    const maxPoints = Math.max(...c.tiers.map((t) => t.points))
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      value: v.value,
      displayValue: v.display,
      tierLabel: tier.label,
      pointsEarned: tier.points,
      maxPoints,
      inspiredBy: c.inspiredBy,
    }
  })

  // 5. Sybil flags
  const sybilFlags: CheckerSybilHit[] = []
  if (txCount === 0) {
    sybilFlags.push({
      id: 'no_activity',
      name: SYBIL_FLAGS.find((s) => s.id === 'no_activity')!.name,
      description: SYBIL_FLAGS.find((s) => s.id === 'no_activity')!.description,
      severity: 'critical',
      penalty: 99,
    })
  }
  if (basescanOk && walletAgeDays > 0 && walletAgeDays < 7) {
    sybilFlags.push({
      id: 'wallet_too_new',
      name: SYBIL_FLAGS.find((s) => s.id === 'wallet_too_new')!.name,
      description: SYBIL_FLAGS.find((s) => s.id === 'wallet_too_new')!.description,
      severity: 'warning',
      penalty: 1,
    })
  }
  if (basescanOk && txCount >= 5 && months <= 1) {
    sybilFlags.push({
      id: 'single_day_burst',
      name: SYBIL_FLAGS.find((s) => s.id === 'single_day_burst')!.name,
      description: SYBIL_FLAGS.find((s) => s.id === 'single_day_burst')!.description,
      severity: 'warning',
      penalty: 2,
    })
  }
  // duplicate-token flag is already prevented at write-time in /api/verify-token;
  // we surface a hint when the wallet is unverified but identity is required for max tier.
  if (!hasBaseVerify) {
    // not a sybil flag per se — just no points on identity criterion
  }

  // 6. Final score
  const earned = metrics.reduce((sum, m) => sum + m.pointsEarned, 0)
  const penalty = sybilFlags.reduce((sum, f) => sum + f.penalty, 0)
  const totalScore = Math.max(0, earned - penalty)

  return {
    address,
    totalScore,
    maxScore: MAX_SCORE,
    tier: tierFromScore(totalScore, MAX_SCORE),
    metrics,
    sybilFlags,
    identity: { hasBaseVerify, provider: identityProvider, tokenTaken },
    dataSources: { rpc: rpcOk, basescan: basescanOk },
    warnings,
  }
}
