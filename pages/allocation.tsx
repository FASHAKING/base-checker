import Head from 'next/head'
import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Layout } from '../components/Layout'
import {
  AllocationParams,
  DEFAULT_PARAMS,
  SCENARIOS,
  estimateAllocation,
  formatCompactNumber,
  formatUsd,
} from '../lib/allocationModel'

type CheckerResult = {
  address: string
  totalScore: number
  maxScore: number
  bonusScore: number
  bonusMaxScore: number
  tier: 'ineligible' | 'low' | 'medium' | 'high' | 'whale'
  minimumEligibility: {
    meets: boolean
    hasActivity: boolean
    hasCommitment: boolean
    hasCriticalSybil: boolean
    failureReasons: string[]
  }
  warnings: string[]
}

const TIER_COLORS: Record<CheckerResult['tier'], string> = {
  ineligible: '#991b1b',
  low: '#92400e',
  medium: '#1e40af',
  high: '#065f46',
  whale: '#5b21b6',
}

export default function AllocationPage() {
  const { address: connected } = useAccount()
  const [input, setInput] = useState('')
  const [baseAppInput, setBaseAppInput] = useState('')
  const [params, setParams] = useState<AllocationParams>(DEFAULT_PARAMS)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [result, setResult] = useState<CheckerResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const targetAddress = input.trim() || connected || ''

  const runCheck = async () => {
    setError('')
    setResult(null)
    setIsLoading(true)
    try {
      const qs = new URLSearchParams({ address: targetAddress })
      if (baseAppInput.trim()) qs.set('baseApp', baseAppInput.trim())
      const res = await fetch(`/api/check-wallet?${qs.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Check failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
    } finally {
      setIsLoading(false)
    }
  }

  const estimate = useMemo(() => {
    if (!result) return null
    return estimateAllocation(result, params)
  }, [result, params])

  const updateParam = <K extends keyof AllocationParams>(key: K, value: AllocationParams[K]) => {
    setParams((p) => ({ ...p, [key]: value }))
  }


  return (
    <Layout title="$BASE Airdrop Allocation Simulator">
      <Head>
        <title>$BASE Allocation Estimator</title>
        <meta
          name="description"
          content="Estimate how many $BASE tokens a wallet would receive across tunable supply, airdrop %, and FDV scenarios."
        />
      </Head>

      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', fontWeight: 700, margin: '0 0 0.5rem', color: '#1a1a1a' }}>
            $BASE Allocation Estimator
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#666', margin: 0, lineHeight: 1.4 }}>
            Pipes the /checker eligibility score through a tunable airdrop economic model.
            Adjust supply, airdrop %, FDV, and tier curve to see what allocation a wallet would get.
          </p>
        </div>

        {/* Address inputs */}
        <Card>
          <Label>Wallet address (required)</Label>
          <Input
            value={input}
            onChange={setInput}
            placeholder={connected ? `Default: ${connected.slice(0, 8)}…${connected.slice(-6)}` : '0x…'}
          />
          <div style={{ height: 8 }} />
          <Label>Base App / Smart Wallet (optional)</Label>
          <Input value={baseAppInput} onChange={setBaseAppInput} placeholder="0x…" />

          <button
            onClick={runCheck}
            disabled={isLoading || !targetAddress}
            style={{
              marginTop: 12,
              padding: '0.75rem 1.25rem',
              background: isLoading || !targetAddress ? '#f3f4f6' : '#0052FF',
              color: isLoading || !targetAddress ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: 10,
              fontWeight: 600,
              cursor: isLoading || !targetAddress ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem',
              width: '100%',
            }}
          >
            {isLoading ? 'Checking eligibility…' : 'Estimate my $BASE allocation'}
          </button>
        </Card>

        {error && (
          <div style={errorBox}>{error}</div>
        )}

        {/* Economic parameters */}
        <Card>
          <SectionTitle>Airdrop economics</SectionTitle>

          {/* Scenario picker */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {Object.entries(SCENARIOS).map(([key, scenario]) => (
              <button
                key={key}
                onClick={() => setParams((p) => ({ ...p, ...scenario }))}
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: '0.5rem 0.75rem',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#374151',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                title={scenario.note}
              >
                {scenario.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: 12, padding: 8, background: '#f9fafb', borderRadius: 6, lineHeight: 1.4 }}>
            Real launches for context: <strong>ARB</strong> $1.40 launch ($14B FDV) → $0.40 now ·{' '}
            <strong>OP</strong> $1.80 ($8B) → $1.50 · <strong>ZK</strong> $0.22 ($5B) → $0.06 ·{' '}
            <strong>ZRO</strong> $4.50 ($4.5B) → $2.50 · <strong>STRK</strong> $2.00 ($20B) → $0.20.
            L2 tokens typically lose 45-90% within months of launch.
          </div>

          <NumberRow
            label="Total $BASE supply"
            value={params.totalSupply}
            onChange={(v) => updateParam('totalSupply', v)}
            suffix="tokens"
            hint="ZRO 1B · ARB 10B · OP 4.3B · ZK 21B"
          />
          <NumberRow
            label="Airdrop allocation"
            value={params.airdropPct * 100}
            onChange={(v) => updateParam('airdropPct', v / 100)}
            suffix="%"
            hint="Mean of ARB 11.6% / OP 5% / ZK 17.5% / ZRO 8.5% ≈ 10%"
          />
          <NumberRow
            label="FDV at launch"
            value={params.fdvUsd}
            onChange={(v) => updateParam('fdvUsd', v)}
            suffix="USD"
            hint="Default $3B (between JUP $6.5B and ZK $5B). Bull case $6B. Sustained 6-mo: $1B."
          />
          <NumberRow
            label="Floor (USD min-eligible user gets)"
            value={params.floorUsd}
            onChange={(v) => updateParam('floorUsd', v)}
            suffix="USD"
            hint="Hard FLOOR. ARB $1.7k · OP $450 · ZK $100 · ZRO $225. Default $500 matches ARB's floor:cap ratio (~10%)."
          />
          <NumberRow
            label="Whale anchor (USD max-score user gets)"
            value={params.whaleAnchorUsd}
            onChange={(v) => updateParam('whaleAnchorUsd', v)}
            suffix="USD"
            hint="Hard CAP. Median power-user payouts: ARB $14k, OP $50k (outlier), ZRO $45k. Default $5k = median."
          />

          <button
            onClick={() => setShowAdvanced((s) => !s)}
            style={{
              marginTop: 12,
              background: 'none',
              border: 'none',
              color: '#0052FF',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showAdvanced ? '▼' : '▶'} Advanced: distribution curve
          </button>

          {showAdvanced && (
            <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 8, lineHeight: 1.4 }}>
                Shapes how allocation scales with score. 1.0 = linear · 1.5 = mild whale skew (default, matches ARB) · 2.0 = strong whale skew.
              </div>
              <NumberRow
                label="Curve exponent"
                value={params.curveExponent}
                onChange={(v) => updateParam('curveExponent', v)}
                suffix="×"
                hint={`At ${params.curveExponent}, a 50%-score user gets ${(Math.pow(0.5, params.curveExponent) * 100).toFixed(0)}% of whale tokens.`}
                small
              />
            </div>
          )}

          <button
            onClick={() => setParams(DEFAULT_PARAMS)}
            style={{
              marginTop: 8,
              background: 'none',
              border: '1px solid #e5e7eb',
              color: '#6b7280',
              fontSize: '0.8rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Reset to defaults
          </button>
        </Card>

        {/* Result */}
        {result && estimate && (
          <>
            {/* Minimum eligibility gate */}
            <Card
              style={{
                borderColor: result.minimumEligibility.meets ? '#bbf7d0' : '#fecaca',
                background: result.minimumEligibility.meets ? '#f0fdf4' : '#fef2f2',
              }}
            >
              <SectionTitle
                style={{
                  color: result.minimumEligibility.meets ? '#065f46' : '#991b1b',
                  margin: 0,
                }}
              >
                {result.minimumEligibility.meets ? '✓ Meets minimum eligibility' : '✗ Does not meet minimum eligibility'}
              </SectionTitle>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <EligibilityBadge
                  label="Activity"
                  passed={result.minimumEligibility.hasActivity}
                  hint="tx count, months active, or unique contracts"
                />
                <EligibilityBadge
                  label="Commitment"
                  passed={result.minimumEligibility.hasCommitment}
                  hint="ETH balance, Base Verify, or wallet age"
                />
                <EligibilityBadge
                  label="No critical sybil"
                  passed={!result.minimumEligibility.hasCriticalSybil}
                  hint="zero txs, duplicate identity"
                />
              </div>
              {!result.minimumEligibility.meets && (
                <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#991b1b' }}>
                  {result.minimumEligibility.failureReasons.map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              )}
            </Card>

            <Card style={{ borderColor: TIER_COLORS[result.tier] + '40', background: TIER_COLORS[result.tier] + '08' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: TIER_COLORS[result.tier], letterSpacing: '0.05em', fontWeight: 700 }}>
                  Tier: {result.tier} ({result.totalScore} / {result.maxScore} pts)
                </div>
                <div style={{ fontSize: '3rem', fontWeight: 800, color: TIER_COLORS[result.tier], lineHeight: 1.1, marginTop: 8 }}>
                  {formatCompactNumber(estimate.userTokens)}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: TIER_COLORS[result.tier], opacity: 0.7 }}>
                  $BASE
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: TIER_COLORS[result.tier], marginTop: 12 }}>
                  ≈ {formatUsd(estimate.userUsd)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>
                  at {formatUsd(estimate.tokenPriceUsd)} per $BASE
                </div>
                {estimate.eligible && (
                  <>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 6 }}>
                      = {estimate.poolSharePct.toFixed(5)}% of the total airdrop pool
                    </div>
                    {estimate.hitFloor && (
                      <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#1e40af', fontWeight: 600 }}>
                        ⬆️ Floored at {formatUsd(params.floorUsd)} — your raw curve value was below the floor
                      </div>
                    )}
                    {estimate.hitCap && (
                      <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#5b21b6', fontWeight: 600 }}>
                        ⬇️ Capped at {formatUsd(params.whaleAnchorUsd)} — your raw curve value exceeded the cap
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: '0.65rem', color: '#9ca3af' }}>
                      Range: {formatUsd(params.floorUsd)} (floor) – {formatUsd(params.whaleAnchorUsd)} (cap)
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card>
              <SectionTitle>How this was calculated</SectionTitle>
              <BreakdownRow label="Total supply" value={`${formatCompactNumber(params.totalSupply)} $BASE`} />
              <BreakdownRow label="Airdrop pool" value={`${formatCompactNumber(estimate.poolTokens)} $BASE (${(params.airdropPct * 100).toFixed(1)}%)`} />
              <BreakdownRow label="Pool USD value @ FDV" value={formatUsd(estimate.poolUsd)} />
              <BreakdownRow label="Token price (FDV ÷ supply)" value={formatUsd(estimate.tokenPriceUsd)} />
              <BreakdownRow label="Floor (min eligible)" value={`${formatCompactNumber(estimate.floorTokens)} $BASE (${formatUsd(params.floorUsd)})`} />
              <BreakdownRow label="Cap (max eligible)" value={`${formatCompactNumber(estimate.whaleAnchorTokens)} $BASE (${formatUsd(params.whaleAnchorUsd)})`} />
              <BreakdownRow label="Your score" value={`${result.totalScore} / ${result.maxScore} (${(estimate.scoreRatio * 100).toFixed(1)}%)`} />
              <BreakdownRow label={`Raw curve value (^${params.curveExponent})`} value={`${formatCompactNumber(estimate.uncappedTokens)} $BASE`} />
              <BreakdownRow
                label="After floor & cap clamp"
                value={estimate.eligible ? `${formatCompactNumber(estimate.userTokens)} $BASE` : '0 $BASE (below minimum)'}
                bold
              />
            </Card>

            {result.warnings.length > 0 && (
              <Card style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
                <SectionTitle>Notes from the eligibility check</SectionTitle>
                {result.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: 4 }}>• {w}</div>
                ))}
              </Card>
            )}
          </>
        )}

        {!result && !isLoading && (
          <Card>
            <SectionTitle>What this does</SectionTitle>
            <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, margin: 0 }}>
              Runs <code>/api/check-wallet</code> for your address, checks if you meet the minimum
              eligibility bar (activity + commitment + no critical sybil), then scales your
              allocation off a whale anchor by your score ratio raised to the curve exponent.
            </p>
            <SectionTitle style={{ marginTop: 16 }}>Minimum eligibility (recommended)</SectionTitle>
            <p style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.5, margin: '0 0 8px' }}>
              Mirrors what every major L2 drop required. You must pass <strong>all three</strong>:
            </p>
            <ul style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
              <li><strong>≥1 activity criterion</strong> — tx count, months active, or unique contracts (matches ARB ≥4 txs, OP repeat-user, ZK ≥10 txs)</li>
              <li><strong>≥1 commitment criterion</strong> — ETH balance, Base Verify identity, or wallet age (matches ARB bridged-volume, ZK held ≥$50, ZRO cross-chain message)</li>
              <li><strong>No critical sybil flags</strong> — zero activity or duplicate identity</li>
            </ul>
            <SectionTitle style={{ marginTop: 16 }}>Defaults sourced from real L2 launches</SectionTitle>
            <ul style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
              <li><strong>Supply 1B</strong> — your spec; matches ZRO exactly</li>
              <li><strong>Airdrop 10%</strong> — mean of ARB 11.6% / OP 5% / ZK 17.5% / ZRO 8.5%</li>
              <li><strong>FDV $3B</strong> — between JUP ($6.5B) and ZK ($5B); realistic for current market</li>
              <li><strong>Floor $500</strong> — min-eligible user payout. Matches ARB's floor:cap ratio (~10%). Real floors: ARB $1.7k, OP $450, ZK $100, ZRO $225</li>
              <li><strong>Whale anchor (cap) $5k</strong> — max-score user payout. Median power-user payout in past drops (ARB $3-6k, OP $3-8k, ZRO $3-8k, ZK $2-5k)</li>
              <li><strong>Curve exponent 1.5</strong> — mild whale skew; a 50%-score user gets ~35% of whale tokens (linear would give 50%, ARB's actual curve was steeper)</li>
            </ul>
            <div style={{ marginTop: 12, padding: 10, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, fontSize: '0.75rem', color: '#1e40af', lineHeight: 1.4 }}>
              <strong>Why floor + cap?</strong> Every major L2 drop (ARB, OP, ZK, ZRO, STRK) used both.
              The cap kills sybil farming incentives (can't game your way to infinity) and prevents
              whales from draining the pool. The floor makes &quot;passing eligibility&quot; mean something
              real — bottom-tier qualifying users get a meaningful allocation, not 1 token.
            </div>
            <div style={{ marginTop: 8, padding: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: '0.75rem', color: '#92400e', lineHeight: 1.4 }}>
              <strong>Honest note:</strong> every major L2 token lost 45-90% within months of launch
              (ARB -70%, ZK -70%+, STRK -90%). Use the &quot;Bear / sustained&quot; scenario to model what you'd actually be holding 6 months in.
            </div>
          </Card>
        )}
      </div>
    </Layout>
  )
}

const cardBase = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: '1rem',
  marginBottom: '1rem',
  boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...cardBase, ...style }}>{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
      {children}
    </label>
  )
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '0.65rem 0.75rem',
        border: '1px solid #d1d5db',
        borderRadius: 10,
        fontSize: '0.9rem',
        fontFamily: 'monospace',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  )
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a', ...style }}>
      {children}
    </h3>
  )
}

function NumberRow({
  label,
  value,
  onChange,
  suffix,
  hint,
  small,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  hint?: string
  small?: boolean
}) {
  return (
    <div style={{ marginBottom: small ? 6 : 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <label style={{ fontSize: small ? '0.75rem' : '0.8rem', fontWeight: 600, color: '#374151' }}>
          {label}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{
              width: 140,
              padding: '0.35rem 0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              textAlign: 'right',
              outline: 'none',
            }}
          />
          {suffix && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: 40 }}>{suffix}</span>
          )}
        </div>
      </div>
      {hint && (
        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>{hint}</div>
      )}
    </div>
  )
}

function EligibilityBadge({ label, passed, hint }: { label: string; passed: boolean; hint: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 140,
        padding: '0.5rem 0.75rem',
        background: passed ? '#dcfce7' : '#fee2e2',
        border: `1px solid ${passed ? '#86efac' : '#fca5a5'}`,
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: passed ? '#065f46' : '#991b1b' }}>
        {passed ? '✓' : '✗'} {label}
      </div>
      <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 2 }}>{hint}</div>
    </div>
  )
}

function BreakdownRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem' }}>
      <span style={{ color: '#4b5563', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontFamily: 'monospace', color: bold ? '#0052FF' : '#1a1a1a', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  padding: '0.75rem 1rem',
  borderRadius: 12,
  fontSize: '0.9rem',
  marginBottom: '1rem',
}
