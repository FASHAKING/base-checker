import Head from 'next/head'
import { useMemo, useState } from 'react'
import {
  CRITERIA,
  BONUS_CRITERIA,
  Criterion,
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
  accent: '#0052FF',
  accentSoft: '#1d4ed8',
  gold: '#d97706',
  green: '#4ade80',
  greenDeep: '#22c55e',
  greenBg: '#0c2618',
  red: '#ef4444',
  redBg: '#2a0f12',
  purple: '#a855f7',
}

const PASS = '✓'
const FAIL = '✗'

export default function CheckerPage() {
  const [input, setInput] = useState('')
  const [baseAppInput, setBaseAppInput] = useState('')
  const [fidInput, setFidInput] = useState('')
  const [showBaseAppField, setShowBaseAppField] = useState(false)
  const [showFidField, setShowFidField] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Tunable economics
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

  const shortAddr = (a: string) =>
    a.length > 10 ? `${a.slice(0, 6)}..${a.slice(-4)}` : a

  return (
    <>
      <Head>
        <title>$BASE Airdrop Calculator</title>
        <meta name="description" content="Check any Base mainnet wallet or basename against a unified airdrop eligibility rubric." />
        <link rel="icon" href="/base-logo.svg" type="image/svg+xml" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap"
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
        {/* Top brand bar — centered */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '1.5rem 1.5rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <img src="/base-logo.svg" alt="Base" width={28} height={28} />
          <span
            style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              letterSpacing: '0.16em',
              color: C.text,
            }}
          >
            BASE AIRDROP CALCULATOR
          </span>
        </div>

        {/* Search */}
        <div
          style={{
            maxWidth: 1000,
            margin: '0 auto',
            padding: '2rem 1.5rem 0',
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
              padding: 5,
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
            <PlusToggle
              active={showBaseAppField || !!baseAppInput}
              hasValue={!!baseAppInput}
              onClick={() => setShowBaseAppField((s) => !s)}
              label="Base App"
            />
            <PlusToggle
              active={showFidField || !!fidInput}
              hasValue={!!fidInput}
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
                fontWeight: 800,
                fontSize: '0.75rem',
                letterSpacing: '0.08em',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isLoading ? 'CHECKING…' : 'CHECK ELIGIBILITY'}
            </button>
          </div>

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
                background: C.redBg,
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

        {/* Body */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '2.5rem 1.5rem 3rem',
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 1fr) 1.3fr',
            gap: '3.5rem',
            alignItems: 'start',
          }}
          className="checker-grid"
        >
          {/* LEFT: result / intro + economics */}
          <div>
            {result && estimate ? (
              <ResultPanel
                result={result}
                estimate={estimate}
                shortAddr={shortAddr}
                allocParams={allocParams}
              />
            ) : (
              <IntroPanel />
            )}

            {/* Economics card */}
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                padding: '1.25rem',
                marginTop: '2rem',
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
                  style={{ width: '100%', accentColor: C.accent }}
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

          {/* RIGHT: criteria with sub-bullets per tier */}
          <div>
            {result ? (
              <CriteriaList result={result} />
            ) : (
              <RubricList />
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
        body { margin: 0; background: ${C.bg}; }
        @media (max-width: 760px) {
          .checker-grid { grid-template-columns: 1fr !important; gap: 2.5rem !important; }
        }
      `}</style>
    </>
  )
}

function ResultPanel({
  result,
  estimate,
  shortAddr,
  allocParams,
}: {
  result: Result
  estimate: NonNullable<ReturnType<typeof estimateAllocation>>
  shortAddr: (a: string) => string
  allocParams: any
}) {
  const eligible = estimate.eligible
  const baseScore = result.totalScore - result.bonusScore
  const baseMax = result.maxScore - result.bonusMaxScore
  return (
    <div>
      <h1
        style={{
          fontFamily: '"Lora", Georgia, serif',
          fontWeight: 500,
          fontSize: 'clamp(2.5rem, 5vw, 3.6rem)',
          lineHeight: 1.0,
          margin: '0 0 1.75rem',
          color: C.text,
          letterSpacing: '-0.02em',
        }}
      >
        {eligible ? "You're Eligible!" : 'Not Eligible'}
      </h1>

      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: C.textMute, marginBottom: 8 }}>
        YOU WILL RECEIVE
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.6rem 1.1rem',
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          marginBottom: '1.5rem',
        }}
      >
        <img src="/base-logo.svg" alt="" width={22} height={22} />
        <span style={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'monospace' }}>
          {Math.round(estimate.userTokens).toLocaleString('en-US')}
        </span>
        <span style={{ color: C.textMute, fontWeight: 700, fontSize: '0.95rem' }}>$BASE</span>
      </div>

      <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: C.textMute, marginBottom: 6 }}>
        ESTIMATED VALUE
      </div>
      <div
        style={{
          fontSize: 'clamp(2rem, 4vw, 2.6rem)',
          fontWeight: 800,
          color: eligible ? C.green : '#fca5a5',
          fontFamily: '"Lora", Georgia, serif',
          letterSpacing: '-0.01em',
          marginBottom: '1.25rem',
          lineHeight: 1,
        }}
      >
        {formatUsd(estimate.userUsd)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.3rem 0.7rem',
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            fontSize: '0.75rem',
            color: C.text,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: eligible ? C.green : C.red }} />
          Score {result.totalScore} / {result.maxScore}
        </div>
        <div style={{ fontSize: '0.7rem', color: C.textMute, fontFamily: 'monospace' }}>
          {result.resolvedFrom && (
            <>
              <span style={{ color: C.accent }}>{result.resolvedFrom}</span> →{' '}
            </>
          )}
          {shortAddr(result.address)}
        </div>
      </div>

      {estimate.farcasterBoostMultiplier > 1 && (
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
      {estimate.hitCap && (
        <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#e9d5ff', fontWeight: 600 }}>
          ⬇️ Capped at {formatCompactNumber(allocParams.whaleAnchorTokens)} $BASE 🎁
        </div>
      )}
      {estimate.hitFloor && (
        <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#93c5fd', fontWeight: 600 }}>
          ⬆️ Floored — you cleared the bar
        </div>
      )}
      {!eligible && (
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#fca5a5' }}>
          {estimate.failureReasons.map((r, i) => (
            <div key={i}>• {r}</div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: '0.65rem', color: C.textDim }}>
        Base score {baseScore} / {baseMax}
        {result.bonusScore > 0 && ` · Bonus +${result.bonusScore} / ${result.bonusMaxScore}`}
      </div>
    </div>
  )
}

function IntroPanel() {
  return (
    <div>
      <h1
        style={{
          fontFamily: '"Lora", Georgia, serif',
          fontWeight: 500,
          fontSize: 'clamp(2.25rem, 4.5vw, 3rem)',
          lineHeight: 1.05,
          margin: '0 0 1rem',
          color: C.text,
          letterSpacing: '-0.02em',
        }}
      >
        <span style={{ color: C.accent }}>$BASE</span> Airdrop Calculator
      </h1>
      <p
        style={{
          fontSize: '0.95rem',
          color: C.textMute,
          lineHeight: 1.55,
          margin: '0 0 1rem',
          maxWidth: 380,
        }}
      >
        Enter any wallet address or basename to estimate a hypothetical $BASE airdrop — scored against patterns from the Arbitrum, Optimism, zkSync, and LayerZero drops, applied to your Base mainnet activity.
      </p>
    </div>
  )
}

function CriteriaList({ result }: { result: Result }) {
  const metricById: Record<string, Metric> = {}
  result.metrics.forEach((m) => (metricById[m.id] = m))
  result.bonusMetrics.forEach((m) => (metricById[m.id] = m))
  return (
    <div>
      {CRITERIA.map((c) => (
        <CriterionRow key={c.id} criterion={c} metric={metricById[c.id]} />
      ))}
      <div
        style={{
          marginTop: '1.75rem',
          paddingBottom: 6,
          fontSize: '0.65rem',
          color: C.textDim,
          letterSpacing: '0.12em',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        Bonus credit (opt-in)
      </div>
      {BONUS_CRITERIA.map((c) => (
        <CriterionRow key={c.id} criterion={c} metric={metricById[c.id]} bonus />
      ))}
      {result.sybilFlags.length > 0 && (
        <>
          <div
            style={{
              marginTop: '1.75rem',
              paddingBottom: 6,
              fontSize: '0.65rem',
              color: '#fca5a5',
              letterSpacing: '0.12em',
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
                padding: '0.85rem 0',
                borderBottom: `1px solid ${C.borderSoft}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: f.severity === 'critical' ? '#fca5a5' : '#fcd34d',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>{FAIL}</span>
                {f.name} (−{f.penalty} pts)
              </div>
              <div style={{ fontSize: '0.75rem', color: C.textMute, marginTop: 4, marginLeft: 22 }}>
                {f.description}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function CriterionRow({
  criterion,
  metric,
  bonus,
}: {
  criterion: Criterion
  metric?: Metric
  bonus?: boolean
}) {
  const passed = !!metric && metric.pointsEarned > 0
  const headColor = passed ? (bonus ? C.purple : C.green) : C.red
  return (
    <div
      style={{
        padding: '0.95rem 0 1rem',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            color: headColor,
            fontWeight: 800,
            fontSize: '0.95rem',
            flexShrink: 0,
          }}
        >
          {passed ? PASS : FAIL}
        </span>
        <span
          style={{
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: passed ? C.text : C.textMute,
            textTransform: 'uppercase',
          }}
        >
          {criterion.name}
        </span>
        {metric && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.7rem',
              color: passed ? headColor : C.textDim,
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          >
            {bonus ? '+' : ''}
            {metric.pointsEarned}/{metric.maxPoints}
          </span>
        )}
      </div>
      {/* Tier sub-bullets */}
      {criterion.tiers.map((t) => {
        const tierMet = !!metric && metric.value >= t.threshold
        return (
          <div key={t.label} style={{ display: 'flex', gap: 10, marginLeft: 6, marginBottom: 4 }}>
            <span
              style={{
                width: 14,
                flexShrink: 0,
                color: tierMet ? C.green : C.textDim,
                fontSize: '0.85rem',
                lineHeight: 1.4,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              {tierMet ? PASS : FAIL}
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: tierMet ? C.text : C.textMute,
                  lineHeight: 1.4,
                }}
              >
                {t.label} <span style={{ color: C.textDim, fontWeight: 400 }}>(+{t.points} pt{t.points > 1 ? 's' : ''})</span>
              </div>
              {metric && (
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: C.textDim,
                    fontFamily: 'monospace',
                    marginTop: 1,
                  }}
                >
                  {metric.displayValue}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RubricList() {
  return (
    <div>
      {CRITERIA.map((c) => (
        <RubricRow key={c.id} criterion={c} />
      ))}
      <div
        style={{
          marginTop: '1.75rem',
          paddingBottom: 6,
          fontSize: '0.65rem',
          color: C.textDim,
          letterSpacing: '0.12em',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        Bonus credit (opt-in)
      </div>
      {BONUS_CRITERIA.map((c) => (
        <RubricRow key={c.id} criterion={c} bonus />
      ))}
    </div>
  )
}

function RubricRow({ criterion, bonus }: { criterion: Criterion; bonus?: boolean }) {
  return (
    <div
      style={{
        padding: '0.95rem 0 1rem',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <span style={{ width: 18, color: C.textDim, fontSize: '0.95rem', textAlign: 'center', fontWeight: 700 }}>
          −
        </span>
        <span
          style={{
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: C.textMute,
            textTransform: 'uppercase',
          }}
        >
          {criterion.name}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>
          {bonus ? '+' : ''}
          {Math.max(...criterion.tiers.map((t) => t.points))} pts max
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', color: C.textMute, marginLeft: 30, marginBottom: 6, lineHeight: 1.5 }}>
        {criterion.description}
      </div>
      {criterion.tiers.map((t) => (
        <div key={t.label} style={{ display: 'flex', gap: 10, marginLeft: 30, fontSize: '0.75rem', color: C.textDim, marginBottom: 2 }}>
          <span>·</span>
          <span>
            {t.label} = +{t.points} pt{t.points > 1 ? 's' : ''}
          </span>
        </div>
      ))}
    </div>
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
          minWidth: 180,
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
              onClick={() => onUnitChange(u)}
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
      </div>
    </div>
  )
}
