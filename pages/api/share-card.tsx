import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'

export const config = { runtime: 'edge' }

// Generates a pixel-perfect 1023×537 PNG of the user's airdrop result card.
// Uses @vercel/og (satori under the hood) so output is identical every time.
//
// Query params:
//   eligible=1|0
//   handle=<basename or short addr>
//   tokens=<number>
//   usd=<number>
//   score=<n>
//   max=<n>
//
// Example:
//   /api/share-card?eligible=1&handle=fashaking.base.eth&tokens=14522&usd=7261&score=20&max=30

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const eligible = searchParams.get('eligible') !== '0'
  const handle = searchParams.get('handle') || '0x…'
  const tokensRaw = parseInt(searchParams.get('tokens') || '0', 10)
  const usdRaw = parseInt(searchParams.get('usd') || '0', 10)
  const score = parseInt(searchParams.get('score') || '0', 10)
  const max = parseInt(searchParams.get('max') || '30', 10)

  const tokens = tokensRaw.toLocaleString('en-US')
  const usd = '$' + usdRaw.toLocaleString('en-US')

  // Hardcoded origin since edge runtime doesn't always have process.env.VERCEL_URL.
  // Public assets resolve relative to the request URL.
  const origin = new URL(req.url).origin
  const baseLogo = `${origin}/base-logo.png`
  const pfp = `${origin}/fashaking.png`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 56px 24px',
          background: eligible
            ? 'linear-gradient(135deg, #eef4ff 0%, #ffffff 50%, #f5f0ff 100%)'
            : 'linear-gradient(135deg, #fff5f5 0%, #ffffff 50%, #fff7ed 100%)',
          fontFamily: 'Inter, sans-serif',
          color: '#0a0a0c',
        }}
      >
        {/* Header: title left, basename pill right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={baseLogo} alt="" width={48} height={48} />
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: '0.13em',
                color: '#0a0a0c',
              }}
            >
              BASE AIRDROP CALCULATOR
            </span>
          </div>
          <div
            style={{
              padding: '12px 24px',
              background: 'rgba(0,82,255,0.06)',
              border: '1px solid rgba(0,82,255,0.18)',
              borderRadius: 999,
              fontSize: 22,
              fontFamily: 'monospace',
              color: '#0a0a0c',
              maxWidth: 340,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {handle}
          </div>
        </div>

        {/* Hero: $BASE allocation */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          {eligible ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                fontSize: 140,
                fontWeight: 900,
                color: '#16a34a',
                letterSpacing: '-0.045em',
                lineHeight: 1,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={baseLogo} alt="" width={110} height={110} />
              <span>{tokens}</span>
              <span style={{ fontSize: 56, color: '#374151', fontWeight: 800 }}>$BASE</span>
            </div>
          ) : (
            <div>
              <div
                style={{
                  fontSize: 100,
                  fontWeight: 900,
                  color: '#dc2626',
                  letterSpacing: '-0.045em',
                  lineHeight: 1,
                }}
              >
                Ahh, Shoot! 😅
              </div>
              <div style={{ fontSize: 22, color: '#6b7280', marginTop: 16 }}>
                No bag this time. Go do something onchain on Base, then come back.
              </div>
            </div>
          )}
        </div>

        {/* Bottom row: USD pill left, score right */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          {eligible ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '18px 30px',
                background: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(22,163,74,0.25)',
                borderRadius: 999,
              }}
            >
              <span style={{ color: '#6b7280', fontWeight: 700, fontSize: 22 }}>≈</span>
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 36,
                  color: '#16a34a',
                  letterSpacing: '-0.02em',
                }}
              >
                {usd}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 22, color: '#9ca3af', fontStyle: 'italic' }}>
              0 $BASE, empty bag
            </div>
          )}
          <div
            style={{
              padding: '18px 28px',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(0,82,255,0.18)',
              borderRadius: 999,
              fontSize: 24,
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#0a0a0c',
            }}
          >
            Score {score} / {max}
          </div>
        </div>

        {/* Attribution footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            paddingTop: 16,
            borderTop: '1px solid rgba(0,0,0,0.06)',
            fontSize: 19,
            color: '#6b7280',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pfp}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: 999 }}
          />
          <span>Built by</span>
          <span style={{ fontWeight: 700, color: '#0a0a0c' }}>@fashaking</span>
          <span style={{ color: '#a3a3a3' }}>·</span>
          <span>hypothetical estimate</span>
        </div>
      </div>
    ),
    {
      width: 1023,
      height: 537,
    },
  )
}
