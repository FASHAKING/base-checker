import Head from 'next/head'
import { useMemo, useState } from 'react'
import {
  CRITERIA,
  BONUS_CRITERIA,
} from '../lib/baseCheckerCriteria'
import {
  DEFAULT_PARAMS,
  estimateAllocation,
  formatCompactNumber,
  formatUsd,
} from '../lib/allocationModel'

type Metric = {
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

type SybilHit = {
  id: string
  name: string
  description: string
  severity: 'warning' | 'critical'
  penalty: number
}

type Result = {
  address: string
  resolvedFrom?: string | null
  totalScore: number
  maxScore: number
  bonusScore: number
  bonusMaxScore: number
  tier: 'ineligible' | 'low' | 'medium' | 'high' | 'whale'
  metrics: Metric[]
  bonusMetrics: Metric[]
  sybilFlags: SybilHit[]
  minimumEligibility: {
    meets: boolean
    hasActivity: boolean
    hasCommitment: boolean
    hasCriticalSybil: boolean
    failureReasons: string[]
  }
  basename: {
    name: string | null
    hasBasename: boolean
    isShortBasename: boolean
  }
  warnings: string[]
}

// Dark theme tokens
const C = {
  bg: '#0a0a0c',
  panel: '#111114',
  panelAlt: '#16161a',
  border: '#26262d',
  borderSoft: '#1c1c22',
  text: '#f5f5f5',
  textMute: '#9b9ba3',
  textDim: '#6c6c75',
  accent: '#0052FF',         // BASE blue
  accentSoft: '#1d4ed8',
  gold: '#d97706',           // gold/amber accent like reference
  goldSoft: '#92400e',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#a855f7',
}

export default function CheckerPage() {
  const [input, setInput] = useState('')
  const [baseAppInput, setBaseAppInput] = useState('')
  const [fidInput, setFidInput] = useState('')
  const [showBaseAppField, setShowBaseAppField] = useState(false)
  const [showFidField, setShowFidField] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const toggleSection = (id: string) => setOpenSections((o) => ({ ...o, [id]: !o[id] }))

  // Tunable economics (from reference design)
  const [supplyMb, setSupplyMb] = useState<{ value: number; unit: 'M' | 'B' }>({ value: 10, unit: 'B' })
  const [fdvMb, setFdvMb] = useState<{ value: number; unit: 'M' | 'B' }>({ value: 3, unit: 'B' })
  const [airdropPct, setAirdropPct] = useState(25)

  const totalSupply = supplyMb.value * (supplyMb.unit === 'B' ? 1_000_000_000 : 1_000_000)
  const fdvUsd = fdvMb.value * (fdvMb.unit === 'B' ? 1_000_000_000 : 1_000_000)
  const allocParams = {
    ...DEFAULT_PARAMS,
    totalSupply,
    fdvUsd,
    airdropPct: airdropPct / 100,
  }
  const projectedPrice = fdvUsd / totalSupply
  const poolTokens = totalSupply * (airdropPct / 100)

  const estimate = useMemo(
    () => (result ? estimateAllocation(result, allocParams) : null),
    [result, allocParams],
  )

  const runCheck = async () => {
    const target = input.trim()
    if (!target) return
    setError('')
    setResult(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ address: target })
      if (baseAppInput.trim()) params.set('baseApp', baseAppInput.trim())
      if (fidInput.trim()) params.set('fid', fidInput.trim())
      const res = await fetch(`/api/check-wallet?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Check failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>$BASE Airdrop Calculator</title>
        <meta
          name="description"
          content="Check any Base mainnet wallet or basename against a unified airdrop eligibility rubric."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Lora:ital,wght@0,400;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          color: C.text,
          fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top search bar */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '1.5rem 1.5rem 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'stretch',
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              padding: 4,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runCheck()}
              placeholder="0x... or yourname.base.eth"
              style={{
                flex: 1,
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'transparent',
                color: C.text,
                fontSize: '0.95rem',
                fontFamily: 'monospace',
                outline: 'none',
                minWidth: 0,
              }}
            />
            {/* Compact + toggles */}
            <PlusToggle
              active={showBaseAppField || baseAppInput.length > 0}
              hasValue={baseAppInput.length > 0}
              onClick={() => setShowBaseAppField((s) => !s)}
              label="Base App"
            />
            <PlusToggle
              active={showFidField || fidInput.length > 0}
              hasValue={fidInput.length > 0}
              onClick={() => setShowFidField((s) => !s)}
              label="Farcaster"
            />
            <button
              onClick={runCheck}
              disabled={isLoading || !input.trim()}
              style={{
                padding: '0.65rem 1.5rem',
                background: isLoading || !input.trim() ? '#1a1a22' : C.accent,
                color: isLoading || !input.trim() ? C.textDim : 'white',
                border: 'none',
                borderRadius: 999,
                fontWeight: 700,
                fontSize: '0.8rem',
                letterSpacing: '0.05em',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {isLoading ? 'CHECKING…' : 'CHECK ELIGIBILITY'}
            </button>
          </div>

          {/* Conditional secondary input lines */}
          {(showBaseAppField || baseAppInput) && (
            <CompactInput
              label="Base App / Smart Wallet"
              value={baseAppInput}
              onChange={setBaseAppInput}
              placeholder="0x… (Coinbase Smart Wallet)"
            />
          )}
          {(showFidField || fidInput) && (
            <CompactInput
              label="Farcaster FID"
              value={fidInput}
              onChange={setFidInput}
              placeholder="e.g. 3621"
            />
          )}

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '0.75rem 1rem',
                background: '#2a0f12',
                border: `1px solid ${C.red}55`,
                borderRadius: 12,
                color: '#fca5a5',
                fontSize: '0.85rem',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Body — two column */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '2rem 1.5rem 3rem',
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 1fr) 1.4fr',
            gap: '3rem',
          }}
          className="checker-grid"
        >
          {/* LEFT: title, description, economics */}
          <div>
            <h1
              style={{
                fontFamily: '"Lora", Georgia, serif',
                fontWeight: 400,
                fontSize: 'clamp(2.5rem, 5vw, 3.4rem)',
                lineHeight: 1.05,
                margin: '0 0 1rem',
                color: C.text,
              }}
            >
              <span style={{ color: C.gold }}>$BASE</span>
              <br />
              Airdrop
              <br />
              Calculator
            </h1>
            <p
              style={{
                fontSize: '0.95rem',
                color: C.textMute,
                lineHeight: 1.55,
                margin: '0 0 2rem',
                maxWidth: 340,
              }}
            >
              Enter any wallet address or basename to estimate a hypothetical $BASE airdrop — scored against patterns from the Arbitrum, Optimism, zkSync, and LayerZero drops, applied to your Base mainnet activity.
            </p>

            {/* Economics card */}
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: '1.25rem',
              }}
            >
              <EconRow
                label="FULLY-DILUTED VALUATION"
                value={fdvMb.value}
                onChange={(v) => setFdvMb({ ...fdvMb, value: v })}
                unit={fdvMb.unit}
                onUnitChange={(u) => setFdvMb({ ...fdvMb, unit: u })}
                prefix="$"
              />
              <EconRow
                label="TOTAL TOKEN SUPPLY"
                value={supplyMb.value}
                onChange={(v) => setSupplyMb({ ...supplyMb, value: v })}
                unit={supplyMb.unit}
                onUnitChange={(u) => setSupplyMb({ ...supplyMb, unit: u })}
              />

              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontSize: '0.65rem',
                    color: C.textMute,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    marginBottom: 8,
                  }}
                >
                  <span>% OF SUPPLY ALLOCATED TO AIRDROP</span>
                  <span style={{ color: C.text, fontSize: '0.9rem', fontWeight: 700 }}>
                    {airdropPct.toFixed(2)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={airdropPct}
                  onChange={(e) => setAirdropPct(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: C.accent,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: C.textDim }}>
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: `1px solid ${C.borderSoft}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                }}
              >
                <span style={{ color: C.textMute }}>Projected $BASE price</span>
                <span style={{ color: C.gold, fontWeight: 700, fontFamily: 'monospace' }}>
                  {formatUsd(projectedPrice)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: 4 }}>
                <span style={{ color: C.textDim }}>Pool size</span>
                <span style={{ color: C.textMute, fontFamily: 'monospace' }}>
                  {formatCompactNumber(poolTokens)} $BASE
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: criteria + result */}
          <div>
            {result ? (
              <>
                {result.resolvedFrom && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '0.5rem 0.75rem',
                      background: C.panelAlt,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 10,
                      fontSize: '0.75rem',
                      color: C.textMute,
                    }}
                  >
                    Resolved <strong style={{ color: C.gold }}>{result.resolvedFrom}</strong> →{' '}
                    <span style={{ fontFamily: 'monospace', color: C.text }}>{result.address}</span>
                  </div>
                )}

                {/* Allocation banner */}
                {estimate && (
                  <div
                    style={{
                      background: estimate.eligible ? '#0c2618' : '#2a0f12',
                      border: `1px solid ${estimate.eligible ? C.green + '55' : C.red + '55'}`,
                      borderRadius: 16,
                      padding: '1.5rem',
                      textAlign: 'center',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: estimate.eligible ? C.green : '#fca5a5', fontWeight: 700, marginBottom: 6 }}>
                      Projected $BASE allocation
                    </div>
                    <div style={{ fontSize: '2.75rem', fontFamily: 'monospace', fontWeight: 800, color: estimate.eligible ? C.green : '#fca5a5', lineHeight: 1 }}>
                      {formatCompactNumber(estimate.userTokens)}
                      <span style={{ fontSize: '1rem', opacity: 0.6, marginLeft: 6 }}>$BASE</span>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 6, color: estimate.eligible ? C.green : '#fca5a5' }}>
                      ≈ {formatUsd(estimate.userUsd)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: C.textDim, marginTop: 4 }}>
                      at {formatUsd(estimate.tokenPriceUsd)} / $BASE
                    </div>
                    {estimate.eligible && estimate.farcasterBoostMultiplier > 1 && (
                      <div
                        style={{
                          display: 'inline-block',
                          marginTop: 10,
                          padding: '0.3rem 0.6rem',
                          background: '#3b0764',
                          border: `1px solid ${C.purple}55`,
                          borderRadius: 8,
                          fontSize: '0.7rem',
                          color: '#e9d5ff',
                          fontWeight: 600,
                        }}
                      >
                        🟣 Farcaster boost +{((estimate.farcasterBoostMultiplier - 1) * 100).toFixed(1)}%
                      </div>
                    )}
                    {estimate.hitFloor && (
                      <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#93c5fd', fontWeight: 600 }}>
                        ⬆️ Floored at {formatCompactNumber(allocParams.floorTokens)} $BASE
                      </div>
                    )}
                    {estimate.hitCap && (
                      <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#e9d5ff', fontWeight: 600 }}>
                        ⬇️ Capped at {formatCompactNumber(allocParams.whaleAnchorTokens)} $BASE 🎁
                      </div>
                    )}
                    {!estimate.eligible && (
                      <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#fca5a5', textAlign: 'left' }}>
                        {estimate.failureReasons.map((r, i) => (
                          <div key={i}>• {r}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Criteria list */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {result.metrics.map((m) => (
                    <CollapsibleCriterion
                      key={m.id}
                      metric={m}
                      open={!!openSections[m.id]}
                      onToggle={() => toggleSection(m.id)}
                    />
                  ))}
                </div>

                {/* Bonus criteria heading */}
                <div
                  style={{
                    marginTop: '1.5rem',
                    paddingBottom: 6,
                    fontSize: '0.65rem',
                    color: C.textDim,
                    letterSpacing: '0.1em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Bonus credit (opt-in)
                </div>
                {result.bonusMetrics.map((m) => (
                  <CollapsibleCriterion
                    key={m.id}
                    metric={m}
                    open={!!openSections[m.id]}
                    onToggle={() => toggleSection(m.id)}
                    bonus
                  />
                ))}

                {/* Sybil flags */}
                {result.sybilFlags.length > 0 && (
                  <>
                    <div
                      style={{
                        marginTop: '1.5rem',
                        paddingBottom: 6,
                        fontSize: '0.65rem',
                        color: '#fca5a5',
                        letterSpacing: '0.1em',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      Sybil flags
                    </div>
                    {result.sybilFlags.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          padding: '0.75rem 0',
                          borderBottom: `1px solid ${C.borderSoft}`,
                          color: f.severity === 'critical' ? '#fca5a5' : '#fcd34d',
                          fontSize: '0.85rem',
                        }}
                      >
                        {f.severity === 'critical' ? '🚫' : '⚠️'} {f.name} (−{f.penalty} pts)
                        <div style={{ fontSize: '0.7rem', color: C.textMute, marginTop: 2 }}>{f.description}</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {CRITERIA.map((c) => (
                  <CollapsibleStaticCriterion
                    key={c.id}
                    name={c.name}
                    description={c.description}
                    tiers={c.tiers.map((t) => `${t.label} = ${t.points}pt`)}
                    open={!!openSections[c.id]}
                    onToggle={() => toggleSection(c.id)}
                  />
                ))}
                <div
                  style={{
                    marginTop: '1.5rem',
                    paddingBottom: 6,
                    fontSize: '0.65rem',
                    color: C.textDim,
                    letterSpacing: '0.1em',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  Bonus credit (opt-in)
                </div>
                {BONUS_CRITERIA.map((c) => (
                  <CollapsibleStaticCriterion
                    key={c.id}
                    name={c.name}
                    description={c.description}
                    tiers={c.tiers.map((t) => `${t.label} = +${t.points}pt`)}
                    open={!!openSections[c.id]}
                    onToggle={() => toggleSection(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '1.5rem',
            borderTop: `1px solid ${C.borderSoft}`,
            textAlign: 'center',
            fontSize: '0.7rem',
            color: C.textDim,
            lineHeight: 1.55,
          }}
        >
          Hypothetical calculator. Not affiliated with Base, Coinbase, or any token issuer.
          <br />
          Scoring mirrors public eligibility patterns from the Arbitrum, Optimism, zkSync, and LayerZero airdrops.
        </div>
      </div>

      <style jsx global>{`
        body {
          margin: 0;
          background: ${C.bg};
        }
        @media (max-width: 720px) {
          .checker-grid {
            grid-template-columns: 1fr !important;
            gap: 2rem !important;
          }
        }
        input[type="range"]::-webkit-slider-thumb {
          background: ${C.accent};
        }
        input[type="range"]::-moz-range-thumb {
          background: ${C.accent};
        }
      `}</style>
    </>
  )
}

function PlusToggle({
  active,
  hasValue,
  onClick,
  label,
}: {
  active: boolean
  hasValue: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      type="button"
      style={{
        width: 38,
        height: 38,
        border: 'none',
        borderRadius: '50%',
        background: hasValue ? C.gold : active ? C.accentSoft : C.panelAlt,
        color: hasValue || active ? 'white' : C.textMute,
        cursor: 'pointer',
        fontSize: '1.1rem',
        lineHeight: 1,
        fontWeight: 600,
        margin: 'auto 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {hasValue ? '✓' : '+'}
    </button>
  )
}

function CompactInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          color: C.textMute,
          letterSpacing: '0.06em',
          minWidth: 160,
        }}
      >
        {label.toUpperCase()}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '0.55rem 0.85rem',
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          color: C.text,
          fontSize: '0.85rem',
          fontFamily: 'monospace',
          outline: 'none',
        }}
      />
    </div>
  )
}

function EconRow({
  label,
  value,
  onChange,
  unit,
  onUnitChange,
  prefix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit: 'M' | 'B'
  onUnitChange: (u: 'M' | 'B') => void
  prefix?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: '0.65rem',
          color: C.textMute,
          fontWeight: 600,
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            background: C.panelAlt,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '0 0.65rem',
          }}
        >
          {prefix && <span style={{ color: C.textMute, marginRight: 4 }}>{prefix}</span>}
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{
              flex: 1,
              padding: '0.55rem 0',
              background: 'transparent',
              border: 'none',
              color: C.text,
              fontSize: '0.95rem',
              fontFamily: 'monospace',
              outline: 'none',
              minWidth: 0,
            }}
          />
        </div>
        <UnitToggle unit={unit} onChange={onUnitChange} />
      </div>
    </div>
  )
}

function UnitToggle({ unit, onChange }: { unit: 'M' | 'B'; onChange: (u: 'M' | 'B') => void }) {
  return (
    <div
      style={{
        display: 'flex',
        background: C.panelAlt,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {(['M', 'B'] as const).map((u) => (
        <button
          key={u}
          onClick={() => onChange(u)}
          type="button"
          style={{
            padding: '0 0.85rem',
            background: unit === u ? C.accent : 'transparent',
            color: unit === u ? 'white' : C.textMute,
            border: 'none',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

function CollapsibleCriterion({
  metric,
  open,
  onToggle,
  bonus,
}: {
  metric: Metric
  open: boolean
  onToggle: () => void
  bonus?: boolean
}) {
  const passed = metric.pointsEarned > 0
  const accent = passed ? (bonus ? C.purple : C.green) : C.textDim
  return (
    <div style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <button
        onClick={onToggle}
        type="button"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '1rem 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: 'inherit',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: accent,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: passed ? C.text : C.textMute,
              textTransform: 'uppercase',
            }}
          >
            {metric.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.75rem', color: accent, fontWeight: 700, fontFamily: 'monospace' }}>
            {bonus ? '+' : ''}
            {metric.pointsEarned}/{metric.maxPoints}
          </span>
          <span style={{ color: C.textMute, fontSize: '1.1rem', lineHeight: 1, fontWeight: 300 }}>
            {open ? '−' : '+'}
          </span>
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 0 1rem 18px', fontSize: '0.8rem', color: C.textMute, lineHeight: 1.55 }}>
          <div>
            Value: <span style={{ color: C.text, fontFamily: 'monospace' }}>{metric.displayValue}</span>
          </div>
          <div style={{ marginTop: 2 }}>
            Tier: <span style={{ color: C.text }}>{metric.tierLabel}</span>
          </div>
          {metric.inspiredBy.length > 0 && (
            <div style={{ marginTop: 4, fontSize: '0.7rem', color: C.textDim }}>
              Inspired by: {metric.inspiredBy.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CollapsibleStaticCriterion({
  name,
  description,
  tiers,
  open,
  onToggle,
}: {
  name: string
  description: string
  tiers: string[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <button
        onClick={onToggle}
        type="button"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '1rem 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: 'inherit',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{ width: 6, height: 6, borderRadius: '50%', background: C.textDim, flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: C.textMute,
              textTransform: 'uppercase',
            }}
          >
            {name}
          </span>
        </div>
        <span style={{ color: C.textMute, fontSize: '1.1rem', lineHeight: 1, fontWeight: 300 }}>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 0 1rem 18px', fontSize: '0.8rem', color: C.textMute, lineHeight: 1.55 }}>
          {description}
          <div style={{ marginTop: 4, fontSize: '0.7rem', color: C.textDim }}>
            {tiers.join(' · ')}
          </div>
        </div>
      )}
    </div>
  )
}
