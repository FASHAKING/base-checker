import { createPublicClient, http, formatEther, isAddress } from 'viem'
import { base } from 'viem/chains'
import { config } from './config'
import prisma from './prisma'
import {
  CRITERIA,
  BONUS_CRITERIA,
  SYBIL_FLAGS,
  MAX_SCORE,
  scoreTier,
  ACTIVITY_CRITERIA_IDS,
  COMMITMENT_CRITERIA_IDS,
} from './baseCheckerCriteria'
import { MINI_APP_REGISTRY } from './miniAppRegistry'
import { lookupFarcaster, scoreFarcaster, FarcasterProfile } from './farcaster'

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
    chainid: String(config.basescanChainId),
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

export type MinimumEligibility = {
  meets: boolean
  hasActivity: boolean
  hasCommitment: boolean
  hasCriticalSybil: boolean
  failureReasons: string[]
}

export type CheckerResult = {
  address: string
  totalScore: number
  maxScore: number
  bonusScore: number
  bonusMaxScore: number
  tier: 'ineligible' | 'low' | 'medium' | 'high' | 'whale'
  metrics: CheckerMetric[]
  bonusMetrics: CheckerMetric[]
  sybilFlags: CheckerSybilHit[]
  minimumEligibility: MinimumEligibility
  identity: {
    hasBaseVerify: boolean
    provider: string | null
    tokenTaken: boolean
  }
  baseApp: {
    provided: boolean
    address: string | null
    isSmartContract: boolean
    txCount: number
  }
  farcaster: {
    provided: boolean
    fid: number | null
    walletLinked: boolean
    profile: FarcasterProfile | null
    note: string | null
  }
  dataSources: {
    rpc: boolean
    basescan: boolean
    neynar: boolean
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

export async function checkWallet(
  addressRaw: string,
  baseAppAddressRaw?: string,
  farcasterFidRaw?: string,
): Promise<CheckerResult> {
  if (!isAddress(addressRaw)) throw new Error('Invalid address')
  const address = addressRaw.toLowerCase() as `0x${string}`
  const warnings: string[] = []

  // Optional secondary address (user's Base App / Smart Wallet)
  let baseAppAddress: `0x${string}` | null = null
  if (baseAppAddressRaw && baseAppAddressRaw.trim()) {
    if (!isAddress(baseAppAddressRaw)) {
      warnings.push('Base App address invalid — ignored.')
    } else {
      baseAppAddress = baseAppAddressRaw.toLowerCase() as `0x${string}`
    }
  }

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

  // 6. Bonus: Base App / Smart Wallet detection + mini app engagement
  let baseAppIsSmartContract = false
  let baseAppTxCount = 0
  let baseAppValue = 0
  let baseAppDisplay = 'Not provided'

  if (baseAppAddress && rpcOk) {
    try {
      const [code, nonce] = await Promise.all([
        publicClient.getCode({ address: baseAppAddress }),
        publicClient.getTransactionCount({ address: baseAppAddress }),
      ])
      baseAppIsSmartContract = !!code && code !== '0x'
      baseAppTxCount = nonce
      if (baseAppIsSmartContract) {
        if (baseAppTxCount >= 25) {
          baseAppValue = 3
          baseAppDisplay = `Smart wallet, ${baseAppTxCount} txs`
        } else if (baseAppTxCount >= 5) {
          baseAppValue = 2
          baseAppDisplay = `Smart wallet, ${baseAppTxCount} txs`
        } else {
          baseAppValue = 1
          baseAppDisplay = `Smart wallet detected (${baseAppTxCount} txs)`
        }
      } else {
        baseAppDisplay = 'EOA (not a smart wallet)'
        warnings.push(
          'Address provided as Base App wallet has no contract code — it is an EOA, not a Smart Wallet. No bonus awarded.',
        )
      }
    } catch {
      warnings.push('Base App wallet lookup failed.')
    }
  }

  // Mini app engagement — count distinct registry contracts seen in tx history
  // across the primary address (and optionally the Base App wallet).
  let miniAppHits = 0
  let miniAppDisplay = 'Registry empty (no mini apps configured)'
  if (MINI_APP_REGISTRY.length === 0) {
    warnings.push(
      'Mini app registry is empty — no addresses configured. Populate lib/miniAppRegistry.ts to credit users for mini app usage.',
    )
  } else if (basescanOk) {
    const registryLower = new Set(MINI_APP_REGISTRY.map((m) => m.address.toLowerCase()))
    const touched = new Set<string>()
    for (const tx of successfulOutgoingTxs) {
      const to = tx.to.toLowerCase()
      if (registryLower.has(to)) touched.add(to)
    }
    if (baseAppAddress) {
      const aaList = await basescanTxList(baseAppAddress)
      if (aaList) {
        for (const tx of aaList) {
          if (tx.isError !== '0') continue
          const to = tx.to.toLowerCase()
          if (registryLower.has(to)) touched.add(to)
        }
      }
    }
    miniAppHits = touched.size
    miniAppDisplay = `${miniAppHits} mini app${miniAppHits === 1 ? '' : 's'}`
  } else {
    miniAppDisplay = 'BaseScan unavailable — cannot scan tx history'
  }

  // Farcaster FID lookup (optional, via Neynar)
  let farcasterProvided = false
  let farcasterFid: number | null = null
  let farcasterLinked = false
  let farcasterProfile: FarcasterProfile | null = null
  let farcasterValue = 0
  let farcasterDisplay = 'Not provided'
  let farcasterNote: string | null = null
  let neynarOk = false
  if (farcasterFidRaw && farcasterFidRaw.trim()) {
    farcasterProvided = true
    const lookup = await lookupFarcaster(farcasterFidRaw.trim(), address)
    const scored = scoreFarcaster(lookup)
    farcasterValue = scored.value
    farcasterDisplay = scored.display
    if (lookup.ok) {
      neynarOk = true
      farcasterFid = lookup.profile.fid
      farcasterLinked = lookup.walletLinked
      farcasterProfile = lookup.profile
      if (!lookup.walletLinked) {
        farcasterNote =
          'FID provided but this wallet is not in its verified addresses. Ignored to prevent FID-claim abuse.'
        warnings.push(farcasterNote)
      }
    } else {
      farcasterNote = lookup.reason
      warnings.push(`Farcaster: ${lookup.reason}`)
    }
  }

  const bonusValueByCriterion: Record<string, { value: number; display: string }> = {
    base_app_wallet: { value: baseAppValue, display: baseAppDisplay },
    mini_app_usage: { value: miniAppHits, display: miniAppDisplay },
    farcaster: { value: farcasterValue, display: farcasterDisplay },
  }

  const bonusMetrics: CheckerMetric[] = BONUS_CRITERIA.map((c) => {
    const v = bonusValueByCriterion[c.id]
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
  const bonusEarned = bonusMetrics.reduce((sum, m) => sum + m.pointsEarned, 0)
  const bonusMax = BONUS_CRITERIA.reduce(
    (sum, c) => sum + Math.max(...c.tiers.map((t) => t.points)),
    0,
  )

  // 7. Final score (base + bonus, then minus sybil penalties)
  const earned = metrics.reduce((sum, m) => sum + m.pointsEarned, 0)
  const penalty = sybilFlags.reduce((sum, f) => sum + f.penalty, 0)
  const totalScore = Math.max(0, earned + bonusEarned - penalty)

  // 8. Minimum eligibility — mirrors ARB/OP/ZK/ZRO pattern:
  //    require BOTH activity AND commitment, and no critical sybil flags.
  const hasActivity = metrics.some(
    (m) => (ACTIVITY_CRITERIA_IDS as readonly string[]).includes(m.id) && m.pointsEarned >= 1,
  )
  const hasCommitment = metrics.some(
    (m) => (COMMITMENT_CRITERIA_IDS as readonly string[]).includes(m.id) && m.pointsEarned >= 1,
  )
  const hasCriticalSybil = sybilFlags.some((f) => f.severity === 'critical')
  const failureReasons: string[] = []
  if (!hasActivity)
    failureReasons.push(
      'No activity dimension passed — need ≥1 tier in tx count, months active, or unique contracts.',
    )
  if (!hasCommitment)
    failureReasons.push(
      'No commitment dimension passed — need ≥1 tier in ETH balance, Base Verify identity, or wallet age.',
    )
  if (hasCriticalSybil) failureReasons.push('Critical sybil flag triggered.')

  const minimumEligibility: MinimumEligibility = {
    meets: hasActivity && hasCommitment && !hasCriticalSybil,
    hasActivity,
    hasCommitment,
    hasCriticalSybil,
    failureReasons,
  }

  // Tier is gated by the minimum: ineligible if floor not met, regardless of score.
  const computedTier = minimumEligibility.meets
    ? tierFromScore(totalScore, MAX_SCORE + bonusMax)
    : 'ineligible'

  return {
    address,
    totalScore,
    maxScore: MAX_SCORE + bonusMax,
    bonusScore: bonusEarned,
    bonusMaxScore: bonusMax,
    tier: computedTier,
    metrics,
    bonusMetrics,
    sybilFlags,
    minimumEligibility,
    identity: { hasBaseVerify, provider: identityProvider, tokenTaken },
    baseApp: {
      provided: !!baseAppAddress,
      address: baseAppAddress,
      isSmartContract: baseAppIsSmartContract,
      txCount: baseAppTxCount,
    },
    farcaster: {
      provided: farcasterProvided,
      fid: farcasterFid,
      walletLinked: farcasterLinked,
      profile: farcasterProfile,
      note: farcasterNote,
    },
    dataSources: { rpc: rpcOk, basescan: basescanOk, neynar: neynarOk },
    warnings,
  }
}
