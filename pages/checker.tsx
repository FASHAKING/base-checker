import Head from 'next/head'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Layout } from '../components/Layout'
import { CRITERIA, SYBIL_FLAGS } from '../lib/baseCheckerCriteria'

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
  totalScore: number
  maxScore: number
  tier: 'ineligible' | 'low' | 'medium' | 'high' | 'whale'
  metrics: Metric[]
  sybilFlags: SybilHit[]
  identity: { hasBaseVerify: boolean; provider: string | null; tokenTaken: boolean }
  dataSources: { rpc: boolean; basescan: boolean }
  warnings: string[]
}

const TIER_COLORS: Record<Result['tier'], { bg: string; fg: string; label: string }> = {
  ineligible: { bg: '#fef2f2', fg: '#991b1b', label: 'Ineligible' },
  low: { bg: '#fffbeb', fg: '#92400e', label: 'Low — minimal activity' },
  medium: { bg: '#eff6ff', fg: '#1e40af', label: 'Medium — active user' },
  high: { bg: '#ecfdf5', fg: '#065f46', label: 'High — power user' },
  whale: { bg: '#f5f3ff', fg: '#5b21b6', label: 'Whale — top-tier eligibility' },
}

export default function CheckerPage() {
  const { address: connected } = useAccount()
  const [input, setInput] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const runCheck = async (addr: string) => {
    setError('')
    setResult(null)
    setIsLoading(true)
    try {
      const res = await fetch(`/api/check-wallet?address=${encodeURIComponent(addr)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Check failed')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
    } finally {
      setIsLoading(false)
    }
  }

  const targetAddress = input.trim() || connected || ''

  return (
    <Layout title="Base Airdrop Checker">
      <Head>
        <title>Base Checker — Are You Airdrop-Eligible?</title>
        <meta
          name="description"
          content="Check any Base mainnet wallet against a unified eligibility rubric drawn from Arbitrum, Optimism, zkSync, LayerZero, and Base Verify."
        />
      </Head>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2
            style={{
              fontSize: 'clamp(1.75rem, 6vw, 2.5rem)',
              fontWeight: 700,
              color: '#1a1a1a',
              margin: '0 0 0.5rem',
              lineHeight: 1.1,
            }}
          >
            Base Airdrop Checker
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#666', margin: 0, lineHeight: 1.4 }}>
            Score any Base mainnet wallet against a unified rubric blended from Arbitrum, Optimism,
            zkSync, and LayerZero airdrops — plus the Base Verify identity layer from this repo.
          </p>
        </div>

        <div
          style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: '1rem',
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <input
            type="text"
            placeholder={connected ? `Default: ${connected.slice(0, 8)}…${connected.slice(-6)}` : '0x…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              flex: 1,
              padding: '0.65rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 10,
              fontSize: '0.9rem',
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            onClick={() => runCheck(targetAddress)}
            disabled={isLoading || !targetAddress}
            style={{
              padding: '0.65rem 1.25rem',
              background: isLoading || !targetAddress ? '#f3f4f6' : '#0052FF',
              color: isLoading || !targetAddress ? '#9ca3af' : 'white',
              border: 'none',
              borderRadius: 10,
              fontWeight: 600,
              cursor: isLoading || !targetAddress ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Checking…' : 'Check'}
          </button>
        </div>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <>
            {/* Score banner */}
            <div
              style={{
                background: TIER_COLORS[result.tier].bg,
                border: `1px solid ${TIER_COLORS[result.tier].fg}33`,
                borderRadius: 16,
                padding: '1.25rem',
                marginBottom: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: TIER_COLORS[result.tier].fg, fontWeight: 700, marginBottom: 4 }}>
                {TIER_COLORS[result.tier].label}
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: TIER_COLORS[result.tier].fg, lineHeight: 1 }}>
                {result.totalScore}
                <span style={{ fontSize: '1rem', opacity: 0.6 }}> / {result.maxScore}</span>
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: TIER_COLORS[result.tier].fg,
                  opacity: 0.7,
                  marginTop: 6,
                }}
              >
                {result.address}
              </div>
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  borderRadius: 12,
                  padding: '0.75rem 1rem',
                  fontSize: '0.85rem',
                  color: '#92400e',
                  marginBottom: '1rem',
                }}
              >
                {result.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            {/* Metrics */}
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>
                Criteria
              </h3>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {result.metrics.map((m) => {
                  const pct = (m.pointsEarned / m.maxPoints) * 100
                  return (
                    <div key={m.id} style={{ padding: '0.75rem', border: '1px solid #f3f4f6', borderRadius: 10, background: '#fafafa' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <div style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '0.9rem' }}>
                          {m.name}
                          <span style={{ marginLeft: 8, fontSize: '0.65rem', padding: '2px 6px', borderRadius: 6, background: '#e0e7ff', color: '#3730a3', textTransform: 'uppercase' }}>
                            {m.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: pct >= 100 ? '#065f46' : pct > 0 ? '#1e40af' : '#9ca3af' }}>
                          {m.pointsEarned} / {m.maxPoints} pts
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: 4 }}>
                        Value: <strong>{m.displayValue}</strong> · Tier: {m.tierLabel}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        Inspired by: {m.inspiredBy.join(' · ')}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sybil */}
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>
                Sybil flags
              </h3>
              {result.sybilFlags.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#16a34a' }}>
                  ✓ No sybil flags triggered.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {result.sybilFlags.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: 10,
                        border: `1px solid ${f.severity === 'critical' ? '#fecaca' : '#fcd34d'}`,
                        background: f.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: f.severity === 'critical' ? '#991b1b' : '#92400e' }}>
                        {f.severity === 'critical' ? '🚫' : '⚠️'} {f.name} (−{f.penalty} pts)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: 2 }}>
                        {f.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Data sources */}
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginBottom: '1.5rem' }}>
              Data sources: Base mainnet RPC {result.dataSources.rpc ? '✓' : '✗'} ·
              BaseScan {result.dataSources.basescan ? '✓' : '✗ (rate-limited or unconfigured)'} ·
              Identity DB (Prisma)
            </div>
          </>
        )}

        {!result && !isLoading && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>How scoring works</h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5 }}>
              Each criterion has 3 tiers (1 / 2 / 3 points). Max score: 18. Sybil flags subtract
              points; critical flags zero out the score.
            </p>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {CRITERIA.map((c) => (
                <div key={c.id} style={{ padding: '0.5rem 0.75rem', background: '#fafafa', borderRadius: 8, fontSize: '0.8rem' }}>
                  <strong>{c.name}</strong> ({c.category}) — {c.description}
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                    {c.tiers.map((t) => `${t.label} = ${t.points}pt`).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
            <h3 style={{ margin: '1rem 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>Sybil flags</h3>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {SYBIL_FLAGS.map((f) => (
                <div key={f.id} style={{ padding: '0.5rem 0.75rem', background: '#fafafa', borderRadius: 8, fontSize: '0.8rem' }}>
                  <strong>{f.name}</strong> — {f.description} (−{f.penalty} pts,{' '}
                  {f.severity})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
