import Head from 'next/head'
import { useMemo, useRef, useState } from 'react'
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

  // Tunable economics — sliders in billions
  const [supplyB, setSupplyB] = useState(10)
  const [fdvB, setFdvB] = useState(3)
  const [airdropPct, setAirdropPct] = useState(25)

  const totalSupply = supplyB * 1_000_000_000
  const fdvUsd = fdvB * 1_000_000_000

  const applyPreset = (preset: { fdv: number; supply: number; pct: number }) => {
    setFdvB(preset.fdv)
    setSupplyB(preset.supply)
    setAirdropPct(preset.pct)
  }
  const allocParams = {
    ...DEFAULT_PARAMS,
    totalSupply,
    fdvUsd,
    airdropPct: airdropPct / 100,
  }
  const projectedPrice = fdvUsd / totalSupply
  const poolTokens = totalSupply * (airdropPct / 100)

  // Self-attested identity tiers (user-toggleable since we can't verify
  // X Blue / Coinbase One without forcing a wallet connection + signature).
  // Keys = tier point value; we take max(selected) → criterion value.
  const [identityTiers, setIdentityTiers] = useState<Set<number>>(new Set())
  const toggleIdentityTier = (tier: number) =>
    setIdentityTiers((s) => {
      const next = new Set(s)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })

  // Apply self-attestation overrides on top of the backend result.
  const displayResult: Result | null = useMemo(() => {
    if (!result) return null
    if (identityTiers.size === 0) return result
    const override = result.metrics.find((m) => m.id === 'base_verify_identity')
    if (!override) return result
    const labels = ['Verified Coinbase account', 'X Blue Checkmark', 'Coinbase One active']
    const newValue = Math.max(...Array.from(identityTiers))
    const delta = newValue - override.pointsEarned
    return {
      ...result,
      metrics: result.metrics.map((m) =>
        m.id === 'base_verify_identity'
          ? {
              ...m,
              value: newValue,
              pointsEarned: newValue,
              tierLabel: labels[newValue - 1] ?? m.tierLabel,
              displayValue: 'Self-reported by you',
            }
          : m,
      ),
      totalScore: result.totalScore + delta,
      minimumEligibility: {
        ...result.minimumEligibility,
        hasCommitment: result.minimumEligibility.hasCommitment || newValue >= 1,
        meets:
          (result.minimumEligibility.hasActivity) &&
          (result.minimumEligibility.hasCommitment || newValue >= 1) &&
          !result.minimumEligibility.hasCriticalSybil,
        failureReasons: result.minimumEligibility.failureReasons.filter(
          (r) => !r.toLowerCase().includes('commitment'),
        ),
      },
    }
  }, [result, identityTiers])

  const estimate = useMemo(
    () => (displayResult ? estimateAllocation(displayResult, allocParams) : null),
    [displayResult, allocParams],
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
        <link rel="icon" href="/base-logo.png" type="image/png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          position: 'relative',
          minHeight: '100vh',
          color: C.text,
          fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Background video — fixed, behind everything */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
            background: C.bg,
          }}
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.35,
            }}
          >
            <source src="/video/bg.mp4" type="video/mp4" />
          </video>
          {/* Tinted overlay for readability */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(10,10,12,0.55) 0%, rgba(10,10,12,0.75) 50%, rgba(10,10,12,0.92) 100%)',
            }}
          />
        </div>

        {/* All content sits above the video */}
        <div style={{ position: 'relative', zIndex: 1 }}>
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
          <img src="/base-logo.png" alt="Base" width={28} height={28} />
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
            {isLoading ? (
              <CalculatingPanel />
            ) : displayResult && estimate ? (
              <ResultPanel
                result={displayResult}
                estimate={estimate}
                shortAddr={shortAddr}
                allocParams={allocParams}
              />
            ) : (
              <IntroPanel />
            )}

            {/* Tokenomics — visually distinct from page (lighter card, prominent stats top) */}
            <div
              style={{
                marginTop: '2.25rem',
                background: 'linear-gradient(180deg, rgba(0,82,255,0.05) 0%, rgba(0,0,0,0) 100%)',
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 14,
                padding: '1.1rem 1.1rem 1.25rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  letterSpacing: '0.12em',
                  color: C.textMute,
                  fontWeight: 700,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                🧮 TOKENOMICS
              </div>

              {/* Big projected price + pool — prominent */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 14,
                  padding: '0.85rem',
                  background: C.bg,
                  borderRadius: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.6rem', color: C.textDim, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
                    $BASE PRICE
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: C.gold, fontFamily: 'monospace' }}>
                    ${projectedPrice < 0.01 ? projectedPrice.toFixed(4) : projectedPrice.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: C.textDim, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
                    AIRDROP POOL
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>
                    {formatCompactNumber(poolTokens)}
                  </div>
                </div>
              </div>

              {/* Preset chips */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                <PresetChip
                  label="Conservative"
                  active={fdvB === 1 && supplyB === 10 && airdropPct === 10}
                  onClick={() => applyPreset({ fdv: 1, supply: 10, pct: 10 })}
                />
                <PresetChip
                  label="Base case"
                  active={fdvB === 3 && supplyB === 10 && airdropPct === 25}
                  onClick={() => applyPreset({ fdv: 3, supply: 10, pct: 25 })}
                />
                <PresetChip
                  label="Bullish"
                  active={fdvB === 8 && supplyB === 10 && airdropPct === 30}
                  onClick={() => applyPreset({ fdv: 8, supply: 10, pct: 30 })}
                />
              </div>

              {/* Sliders */}
              <SliderRow
                label="FDV"
                value={fdvB}
                onChange={setFdvB}
                min={0.5}
                max={20}
                step={0.5}
                formatValue={(v) => `$${v}B`}
              />
              <SliderRow
                label="Supply"
                value={supplyB}
                onChange={setSupplyB}
                min={1}
                max={21}
                step={1}
                formatValue={(v) => `${v}B $BASE`}
              />
              <SliderRow
                label="Airdrop %"
                value={airdropPct}
                onChange={setAirdropPct}
                min={0}
                max={100}
                step={0.5}
                formatValue={(v) => `${v.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* RIGHT: criteria with sub-bullets per tier */}
          <div>
            {isLoading ? (
              <CalculatingPanelRight />
            ) : displayResult ? (
              <CriteriaList
                result={displayResult}
                identityTiers={identityTiers}
                onToggleIdentityTier={toggleIdentityTier}
              />
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
          <BuiltByFashaking />
        </div>
        </div>
      </div>

      <style jsx global>{`
        body { margin: 0; background: ${C.bg}; }
        @media (max-width: 760px) {
          .checker-grid { grid-template-columns: 1fr !important; gap: 2.5rem !important; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; opacity: 0.6; }
          50% { opacity: 1; }
          100% { background-position: -200% 0; opacity: 0.6; }
        }
        @keyframes calcDots {
          0%, 20% { content: ''; }
          40% { content: '.'; }
          60% { content: '..'; }
          80%, 100% { content: '...'; }
        }
        .calc-dots::after {
          content: '...';
          display: inline-block;
          animation: calcDots 1.4s steps(4, end) infinite;
          width: 1.2em;
          text-align: left;
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
          fontFamily: '"Inter", system-ui, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(2.5rem, 5vw, 3.6rem)',
          lineHeight: 1.0,
          margin: '0 0 0.5rem',
          letterSpacing: '-0.03em',
          color: eligible ? C.text : '#fca5a5',
        }}
      >
        {eligible ? "You're Eligible!" : 'Ahh, Shoot! 😅'}
      </h1>
      {!eligible && (
        <p
          style={{
            margin: '0 0 1.75rem',
            fontSize: '0.9rem',
            color: C.textMute,
            lineHeight: 1.5,
            maxWidth: 340,
          }}
        >
          No bag this time. Your wallet hasn't earned its $BASE stripes yet. Go bridge, swap,
          mint, do something onchain, then come back and check.
        </p>
      )}
      {eligible && <div style={{ marginBottom: '1.25rem' }} />}

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
        <img src="/base-logo.png" alt="" width={22} height={22} />
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
          fontSize: 'clamp(2.2rem, 4.5vw, 3rem)',
          fontWeight: 900,
          color: eligible ? C.green : '#fca5a5',
          fontFamily: '"Inter", system-ui, sans-serif',
          letterSpacing: '-0.035em',
          marginBottom: '1.25rem',
          lineHeight: 1,
        }}
      >
        ${Math.round(estimate.userUsd).toLocaleString('en-US')}
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
          ⬆️ Floored, you cleared the bar
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

      {/* Share your result */}
      <ShareResult result={result} estimate={estimate} shortAddr={shortAddr} />
    </div>
  )
}

function IntroPanel() {
  return (
    <div>
      <h1
        style={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(2.25rem, 4.5vw, 3rem)',
          lineHeight: 1.05,
          margin: '0 0 1rem',
          color: C.text,
          letterSpacing: '-0.03em',
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
        Enter any wallet address or basename to estimate a hypothetical $BASE airdrop, scored against patterns from the Arbitrum, Optimism, zkSync, and LayerZero drops, applied to your Base mainnet activity.
      </p>
    </div>
  )
}

function CriteriaList({
  result,
  identityTiers,
  onToggleIdentityTier,
}: {
  result: Result
  identityTiers: Set<number>
  onToggleIdentityTier: (tier: number) => void
}) {
  const metricById: Record<string, Metric> = {}
  result.metrics.forEach((m) => (metricById[m.id] = m))
  result.bonusMetrics.forEach((m) => (metricById[m.id] = m))
  return (
    <div>
      {/* Self-attestation hint */}
      <div
        style={{
          padding: '0.65rem 0.85rem',
          background: 'rgba(217,119,6,0.08)',
          border: `1px solid rgba(217,119,6,0.25)`,
          borderRadius: 10,
          fontSize: '0.72rem',
          color: C.textMute,
          marginBottom: '1rem',
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: C.gold, fontWeight: 700 }}>💡 No wallet connect needed.</span>{' '}
        For <strong>Base Verify Identity</strong>, you can toggle the tiers below yourself if they apply to you. Your score and allocation update instantly.
      </div>
      {CRITERIA.map((c) => (
        <CriterionRow
          key={c.id}
          criterion={c}
          metric={metricById[c.id]}
          identityTiers={c.id === 'base_verify_identity' ? identityTiers : undefined}
          onToggleIdentityTier={c.id === 'base_verify_identity' ? onToggleIdentityTier : undefined}
        />
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
  identityTiers,
  onToggleIdentityTier,
}: {
  criterion: Criterion
  metric?: Metric
  bonus?: boolean
  identityTiers?: Set<number>
  onToggleIdentityTier?: (tier: number) => void
}) {
  const isSelfAttest = !!identityTiers && !!onToggleIdentityTier
  // Open self-attestable rows by default so users see they can toggle
  const [open, setOpen] = useState(!!isSelfAttest)
  const passed = !!metric && metric.pointsEarned > 0
  const headColor = passed ? (bonus ? C.purple : C.green) : C.red
  return (
    <div style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        type="button"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '0.95rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          color: 'inherit',
          fontFamily: 'inherit',
          textAlign: 'left',
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
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {metric && (
            <span
              style={{
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
          <span style={{ color: C.textMute, fontSize: '1rem', fontWeight: 300, lineHeight: 1, width: 12, textAlign: 'center' }}>
            {open ? '−' : '+'}
          </span>
        </span>
      </button>
      {open && (
        <div style={{ paddingBottom: '0.85rem' }}>
          {isSelfAttest && (
            <div
              style={{
                fontSize: '0.7rem',
                color: C.gold,
                fontWeight: 600,
                marginLeft: 6,
                marginBottom: 8,
                lineHeight: 1.4,
              }}
            >
              ↓ Click any tier below to self-report (no wallet connection required)
            </div>
          )}
          {criterion.tiers.map((t) => {
            const selected = !!identityTiers && identityTiers.has(t.points)
            const tierMet = isSelfAttest
              ? selected
              : !!metric && metric.value >= t.threshold

            const content = (
              <>
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
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: tierMet ? C.text : C.textMute,
                      lineHeight: 1.4,
                    }}
                  >
                    {t.label}{' '}
                    <span style={{ color: C.textDim, fontWeight: 400 }}>
                      (+{t.points} pt{t.points > 1 ? 's' : ''})
                    </span>
                  </div>
                  {metric && !isSelfAttest && (
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
                  {isSelfAttest && selected && (
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: C.green,
                        marginTop: 1,
                        fontStyle: 'italic',
                      }}
                    >
                      ✓ Self-reported
                    </div>
                  )}
                </div>
              </>
            )

            const sharedStyle: React.CSSProperties = {
              display: 'flex',
              gap: 10,
              marginLeft: 6,
              marginBottom: 4,
              alignItems: 'flex-start',
              padding: isSelfAttest ? '6px 8px' : 0,
              borderRadius: isSelfAttest ? 8 : 0,
              background:
                isSelfAttest && selected
                  ? 'rgba(74,222,128,0.08)'
                  : isSelfAttest
                  ? 'rgba(255,255,255,0.02)'
                  : 'transparent',
              border:
                isSelfAttest && selected
                  ? `1px solid ${C.green}55`
                  : isSelfAttest
                  ? `1px solid ${C.borderSoft}`
                  : 'none',
            }

            return isSelfAttest ? (
              <button
                key={t.label}
                type="button"
                onClick={() => onToggleIdentityTier!(t.points)}
                style={{
                  ...sharedStyle,
                  width: '100%',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              >
                {content}
              </button>
            ) : (
              <div key={t.label} style={sharedStyle}>
                {content}
              </div>
            )
          })}
        </div>
      )}
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
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        type="button"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '0.95rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          color: 'inherit',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ width: 18, color: C.textDim, fontSize: '0.95rem', textAlign: 'center', fontWeight: 700 }}>·</span>
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
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.65rem', color: C.textDim, fontFamily: 'monospace' }}>
            {bonus ? '+' : ''}
            {Math.max(...criterion.tiers.map((t) => t.points))} pts max
          </span>
          <span style={{ color: C.textMute, fontSize: '1rem', fontWeight: 300, lineHeight: 1, width: 12, textAlign: 'center' }}>
            {open ? '−' : '+'}
          </span>
        </span>
      </button>
      {open && (
        <div style={{ paddingBottom: '0.85rem' }}>
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
      )}
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

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: C.textMute }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>
          {formatValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: C.accent, display: 'block' }}
      />
    </div>
  )
}

function PresetChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        padding: '0.4rem 0.85rem',
        background: active ? C.accent : 'transparent',
        color: active ? 'white' : C.textMute,
        border: `1px solid ${active ? C.accent : C.border}`,
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  )
}

function BuiltByFashaking() {
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: `1px solid ${C.borderSoft}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: '0.78rem',
        color: C.textMute,
      }}
    >
      <span>Built with</span>
      <span style={{ color: '#ef4444' }}>❤️</span>
      <span>for the Base community by</span>
      <a
        href="https://x.com/fashaking3"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: C.text,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        <img
          src="/fashaking.png"
          alt=""
          width={22}
          height={22}
          style={{ borderRadius: '50%', border: `1px solid ${C.border}` }}
        />
        <span>fashaking</span>
      </a>
    </div>
  )
}

function ShareResult({
  result,
  estimate,
  shortAddr,
}: {
  result: Result
  estimate: NonNullable<ReturnType<typeof estimateAllocation>>
  shortAddr: (a: string) => string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'copy' | 'download' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Handle priority:
  //   1. The wallet's primary .base.eth name (if the L1 reverse-resolver found one)
  //   2. Whatever name the user typed into the search box (if they typed one)
  //   3. Shortened 0x address
  const handle =
    result.basename?.name || result.resolvedFrom || shortAddr(result.address)
  const eligible = estimate.eligible
  const tokens = Math.round(estimate.userTokens).toLocaleString('en-US')
  const usd = '$' + Math.round(estimate.userUsd).toLocaleString('en-US')
  const tweetText = encodeURIComponent(
    eligible
      ? `I'm eligible for ${tokens} $BASE ≈ ${usd} (hypothetical).\n\nCheck yours:`
      : `Ahh, Shoot! 😅 Looks like I'm not on the hypothetical $BASE airdrop list.\n\nCheck yours:`,
  )
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(
    typeof window !== 'undefined' ? window.location.origin + '/checker' : 'https://base-checker.vercel.app/checker',
  )}`

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const captureCanvas = async () => {
    if (!cardRef.current) return null
    const { default: html2canvas } = await import('html2canvas')
    return html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    })
  }

  const downloadImage = async () => {
    setBusy('download')
    try {
      const canvas = await captureCanvas()
      if (!canvas) return
      const link = document.createElement('a')
      link.download = `base-airdrop-${handle.replace(/[^a-z0-9.-]/gi, '_')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      showToast('Downloaded')
    } catch (err) {
      console.error(err)
      showToast('Download failed')
    } finally {
      setBusy(null)
    }
  }

  const copyImage = async () => {
    setBusy('copy')
    try {
      const canvas = await captureCanvas()
      if (!canvas) return
      canvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Copy failed')
          setBusy(null)
          return
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ])
          showToast('Copied to clipboard')
        } catch {
          showToast('Clipboard blocked, use Download')
        } finally {
          setBusy(null)
        }
      }, 'image/png')
    } catch (err) {
      console.error(err)
      showToast('Copy failed')
      setBusy(null)
    }
  }

  return (
    <div style={{ marginTop: '1.75rem' }}>
      <div
        style={{
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          color: C.textMute,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        SHARE YOUR RESULT
      </div>

      {/* Card — uses the design template as a background image with text overlays positioned in % so layout always matches the template regardless of width */}
      <div
        ref={cardRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1023 / 537',
          backgroundImage: 'url(/share-card-template.png)',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          color: '#0a0a0c',
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        {/* Header: title row top-left */}
        <div
          style={{
            position: 'absolute',
            top: '7.5%',
            left: '5.5%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.7em',
            fontSize: 'clamp(0.7rem, 1.7vw, 1rem)',
          }}
        >
          <img
            src="/base-logo.png"
            alt="Base"
            style={{ height: '2.2em', width: '2.2em' }}
          />
          <span
            style={{
              fontWeight: 800,
              letterSpacing: '0.13em',
              color: '#0a0a0c',
              whiteSpace: 'nowrap',
            }}
          >
            BASE AIRDROP CALCULATOR
          </span>
        </div>

        {/* Basename pill top-right */}
        <div
          style={{
            position: 'absolute',
            top: '8.5%',
            right: '5.5%',
            padding: '0.45em 1em',
            background: 'rgba(0,82,255,0.06)',
            border: '1px solid rgba(0,82,255,0.18)',
            borderRadius: 999,
            fontSize: 'clamp(0.65rem, 1.4vw, 0.85rem)',
            fontFamily: 'monospace',
            color: '#0a0a0c',
            maxWidth: '30%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {handle}
        </div>

        {/* Big USD figure — vertically centered */}
        <div
          style={{
            position: 'absolute',
            top: eligible ? '36%' : '38%',
            left: '5.5%',
            right: '5.5%',
            fontSize: eligible ? 'clamp(2.6rem, 8.5vw, 5rem)' : 'clamp(1.8rem, 6vw, 3.4rem)',
            fontWeight: 900,
            color: eligible ? '#16a34a' : '#dc2626',
            fontFamily: '"Inter", system-ui, sans-serif',
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          {eligible ? usd : 'Ahh, Shoot! 😅'}
        </div>
        {!eligible && (
          <div
            style={{
              position: 'absolute',
              top: '55%',
              left: '5.5%',
              right: '5.5%',
              fontSize: 'clamp(0.7rem, 1.4vw, 0.9rem)',
              color: '#6b7280',
              lineHeight: 1.4,
            }}
          >
            No bag this time. Go do something onchain on Base, then come back.
          </div>
        )}

        {/* Token pill — bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: '18%',
            left: '5.5%',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5em',
            padding: '0.5em 1em',
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(0,82,255,0.15)',
            borderRadius: 999,
            fontSize: 'clamp(0.75rem, 1.6vw, 1rem)',
          }}
        >
          {eligible ? (
            <>
              <img
                src="/base-logo.png"
                alt=""
                style={{ height: '1.4em', width: '1.4em' }}
              />
              <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>{tokens}</span>
              <span style={{ color: '#6b7280', fontWeight: 700 }}>$BASE</span>
            </>
          ) : (
            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>0 $BASE, empty bag</span>
          )}
        </div>

        {/* Score pill — bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: '18%',
            right: '5.5%',
            padding: '0.55em 1.1em',
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(0,82,255,0.15)',
            borderRadius: 999,
            fontSize: 'clamp(0.75rem, 1.5vw, 0.95rem)',
            fontFamily: 'monospace',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Score {result.totalScore} / {result.maxScore}
        </div>

        {/* Attribution — bottom center */}
        <div
          style={{
            position: 'absolute',
            bottom: '4%',
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4em',
            fontSize: 'clamp(0.6rem, 1.2vw, 0.8rem)',
            color: '#6b7280',
          }}
        >
          <img
            src="/fashaking.png"
            alt=""
            crossOrigin="anonymous"
            style={{ height: '1.5em', width: '1.5em', borderRadius: '50%' }}
          />
          <span>Built by</span>
          <span style={{ fontWeight: 700, color: '#0a0a0c' }}>@fashaking</span>
          <span style={{ color: '#a3a3a3' }}>·</span>
          <span>hypothetical estimate</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '0.65rem 1.1rem',
            background: '#0a0a0c',
            color: 'white',
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            fontSize: '0.8rem',
            fontWeight: 700,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Share on X →
        </a>
        <button
          type="button"
          onClick={copyImage}
          disabled={busy === 'copy'}
          style={{
            padding: '0.65rem 1.1rem',
            background: 'transparent',
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: busy === 'copy' ? 'wait' : 'pointer',
          }}
        >
          {busy === 'copy' ? 'Copying…' : 'Copy image'}
        </button>
        <button
          type="button"
          onClick={downloadImage}
          disabled={busy === 'download'}
          style={{
            padding: '0.65rem 1.1rem',
            background: 'transparent',
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: busy === 'download' ? 'wait' : 'pointer',
          }}
        >
          {busy === 'download' ? 'Saving…' : 'Download image'}
        </button>
      </div>
      {toast && (
        <div
          style={{
            marginTop: 8,
            fontSize: '0.75rem',
            color: C.green,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function CalculatingPanel() {
  return (
    <div style={{ paddingTop: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: '1.5rem',
        }}
      >
        <img
          src="/base-logo.png"
          alt=""
          width={42}
          height={42}
          style={{
            animation: 'spin 1.4s linear infinite',
          }}
        />
        <div>
          <div
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
              fontWeight: 800,
              lineHeight: 1,
              color: C.text,
              letterSpacing: '-0.03em',
            }}
          >
            Calculating
            <span className="calc-dots" />
          </div>
          <div style={{ fontSize: '0.8rem', color: C.textMute, marginTop: 6 }}>
            Crunching onchain activity, basename, identity…
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {[80, 60, 70, 50].map((w, i) => (
          <div
            key={i}
            style={{
              height: 10,
              width: `${w}%`,
              background: `linear-gradient(90deg, ${C.borderSoft} 0%, ${C.border} 50%, ${C.borderSoft} 100%)`,
              backgroundSize: '200% 100%',
              borderRadius: 6,
              animation: `shimmer 1.6s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function CalculatingPanelRight() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        paddingTop: '0.5rem',
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.95rem 0',
            borderBottom: `1px solid ${C.borderSoft}`,
            gap: 12,
          }}
        >
          <div
            style={{
              height: 12,
              flex: 1,
              maxWidth: 220,
              background: `linear-gradient(90deg, ${C.borderSoft} 0%, ${C.border} 50%, ${C.borderSoft} 100%)`,
              backgroundSize: '200% 100%',
              borderRadius: 4,
              animation: `shimmer 1.6s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
          <div
            style={{
              height: 12,
              width: 40,
              background: `linear-gradient(90deg, ${C.borderSoft} 0%, ${C.border} 50%, ${C.borderSoft} 100%)`,
              backgroundSize: '200% 100%',
              borderRadius: 4,
              animation: `shimmer 1.6s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
            }}
          />
        </div>
      ))}
    </div>
  )
}
