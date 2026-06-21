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

  const updateMultiplier = (tier: CheckerResult['tier'], value: number) => {
    setParams((p) => ({ ...p, multipliers: { ...p.multipliers, [tier]: value } }))
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
            label="Assumed eligible wallets"
            value={params.eligibleWallets}
            onChange={(v) => updateParam('eligibleWallets', v)}
            suffix="wallets"
            hint="ARB 625k · OP 250k · ZK 700k · ZRO 1.28M · STRK 1.35M → median 700k"
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
            {showAdvanced ? '▼' : '▶'} Advanced: tier multipliers
          </button>

          {showAdvanced && (
            <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 8 }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 8 }}>
                Each multiplier scales the base allocation (pool ÷ wallets) for that tier.
              </div>
              {(['ineligible', 'low', 'medium', 'high', 'whale'] as const).map((tier) => (
                <NumberRow
                  key={tier}
                  label={tier.charAt(0).toUpperCase() + tier.slice(1)}
                  value={params.multipliers[tier]}
                  onChange={(v) => updateMultiplier(tier, v)}
                  suffix="×"
                  hint=""
                  small
                />
              ))}
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
              </div>
            </Card>

            <Card>
              <SectionTitle>How this was calculated</SectionTitle>
              <BreakdownRow label="Total supply" value={`${formatCompactNumber(params.totalSupply)} $BASE`} />
              <BreakdownRow label="Airdrop pool" value={`${formatCompactNumber(estimate.poolTokens)} $BASE (${(params.airdropPct * 100).toFixed(1)}%)`} />
              <BreakdownRow label="Pool USD value @ FDV" value={formatUsd(estimate.poolUsd)} />
              <BreakdownRow label="Token price (FDV ÷ supply)" value={formatUsd(estimate.tokenPriceUsd)} />
              <BreakdownRow label="Eligible wallets (assumed)" value={formatCompactNumber(params.eligibleWallets)} />
              <BreakdownRow label="Base allocation (pool ÷ wallets)" value={`${formatCompactNumber(estimate.baseAllocation)} $BASE`} />
              <BreakdownRow label={`Tier multiplier (${result.tier})`} value={`${estimate.tierMultiplier}×`} />
              <BreakdownRow label="In-tier score modulation" value={`${(0.7 + Math.min(1, result.totalScore / result.maxScore) * 0.6).toFixed(2)}×`} />
              <BreakdownRow label="Your allocation" value={`${formatCompactNumber(estimate.userTokens)} $BASE`} bold />
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
              Runs <code>/api/check-wallet</code> for your address, gets your tier
              (ineligible / low / medium / high / whale), then multiplies the base allocation by
              the tier multiplier and modulates by where you scored within the tier (0.7–1.3×).
              All parameters are tunable above.
            </p>
            <SectionTitle style={{ marginTop: 16 }}>Defaults sourced from real L2 launches</SectionTitle>
            <ul style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
              <li><strong>Supply 1B</strong> — your spec; matches ZRO exactly</li>
              <li><strong>Airdrop 10%</strong> — mean of ARB 11.6% / OP 5% / ZK 17.5% / ZRO 8.5%</li>
              <li><strong>FDV $3B</strong> — between JUP ($6.5B) and ZK ($5B). Sustained 6-mo prices have averaged 40-60% of launch FDV, so $3B is closer to the realistic "what the market gives you" number than the launch-day euphoria peak</li>
              <li><strong>700k eligible wallets</strong> — median of ARB 625k / OP 250k / ZK 700k / ZRO 1.28M / STRK 1.35M</li>
              <li><strong>Tier curve 8× / 3× / 1× / 0.25×</strong> — modeled on ARB's tiered structure</li>
            </ul>
            <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: '0.75rem', color: '#92400e', lineHeight: 1.4 }}>
              <strong>Honest note:</strong> every major L2 token lost 45–90% within months of launch
              (ARB -70%, ZK -70%+, STRK -90%). Use the &quot;Bear / sustained&quot; scenario above to model what you'd actually be holding 6 months in, not what it briefly traded at on day 1.
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
