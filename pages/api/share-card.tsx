import { ImageResponse } from '@vercel/og'
import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

// Node.js runtime (default) — simpler than edge for reading files from disk.
// @vercel/og works under either; node lets us read fonts + images with fs
// instead of fetching them, which was the root cause of the 0B bug last time.

// Load fonts + images once at module load (cold start), reuse on subsequent
// requests in the same lambda instance.
const baseSansBold = fs.readFileSync(path.join(process.cwd(), 'assets/BaseSans-Bold.woff'))
const baseSansBlack = fs.readFileSync(path.join(process.cwd(), 'assets/BaseSans-Black.woff'))
const baseSansMonoRegular = fs.readFileSync(
  path.join(process.cwd(), 'assets/BaseSansMono-Regular.woff'),
)
const baseSansMonoMedium = fs.readFileSync(
  path.join(process.cwd(), 'assets/BaseSansMono-Medium.woff'),
)
const baseLogoPng = fs.readFileSync(path.join(process.cwd(), 'public/base-logo.png'))
const fashakingPng = fs.readFileSync(path.join(process.cwd(), 'public/fashaking.png'))

const baseLogoUri = `data:image/png;base64,${baseLogoPng.toString('base64')}`
const fashakingUri = `data:image/png;base64,${fashakingPng.toString('base64')}`

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const q = req.query
    const eligible = q.eligible !== '0'
    const handle = (q.handle as string) || '0x…'
    const tokensRaw = parseInt((q.tokens as string) || '0', 10)
    const usdRaw = parseInt((q.usd as string) || '0', 10)
    const score = parseInt((q.score as string) || '0', 10)
    const max = parseInt((q.max as string) || '30', 10)

    const tokens = tokensRaw.toLocaleString('en-US')
    const usd = '$' + usdRaw.toLocaleString('en-US')

    const image = new ImageResponse(
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
            color: '#0a0a0c',
            fontFamily: '"Base Sans", sans-serif',
          }}
        >
          {/* Header */}
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
              <img src={baseLogoUri} width={48} height={48} alt="" />
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: '0.13em',
                  color: '#0a0a0c',
                  fontFamily: '"Base Sans", sans-serif',
                }}
              >
                BASE AIRDROP CALCULATOR
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                padding: '12px 24px',
                background: 'rgba(0,82,255,0.06)',
                border: '1px solid rgba(0,82,255,0.18)',
                borderRadius: 999,
                fontSize: 22,
                color: '#0a0a0c',
                maxWidth: 340,
                letterSpacing: '-0.03em',
                fontFamily: '"Base Mono", monospace',
                fontWeight: 500,
              }}
            >
              {handle}
            </div>
          </div>

          {/* Hero */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flexGrow: 1,
            }}
          >
            {eligible ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  fontSize: 130,
                  fontWeight: 900,
                  color: '#16a34a',
                  letterSpacing: '-0.045em',
                  lineHeight: 1,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={baseLogoUri} width={100} height={100} alt="" />
                <span
                  style={{
                    display: 'flex',
                    fontFamily: '"Base Mono", monospace',
                    fontWeight: 500,
                    letterSpacing: '-0.06em',
                  }}
                >
                  {tokens}
                </span>
                <span
                  style={{
                    display: 'flex',
                    fontSize: 52,
                    color: '#374151',
                    fontWeight: 700,
                    fontFamily: '"Base Sans", sans-serif',
                    letterSpacing: '0',
                    marginLeft: 12,
                  }}
                >
                  $BASE
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    fontSize: 100,
                    fontWeight: 900,
                    color: '#dc2626',
                    letterSpacing: '-0.045em',
                    lineHeight: 1,
                    fontFamily: '"Base Sans", sans-serif',
                  }}
                >
                  Ahh, Shoot! 😅
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 22,
                    color: '#6b7280',
                    marginTop: 16,
                    fontFamily: '"Base Sans", sans-serif',
                  }}
                >
                  No bag this time. Go do something onchain on Base, then come back.
                </div>
              </div>
            )}
          </div>

          {/* Bottom row */}
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
                  gap: 12,
                  padding: '18px 32px',
                  background: '#ffffff',
                  border: '1px solid rgba(22,163,74,0.25)',
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    color: '#6b7280',
                    fontWeight: 700,
                    fontSize: 18,
                    fontFamily: '"Base Sans", sans-serif',
                    letterSpacing: '0.08em',
                  }}
                >
                  WORTH
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: 36,
                    color: '#16a34a',
                    letterSpacing: '-0.04em',
                    fontFamily: '"Base Mono", monospace',
                  }}
                >
                  {usd}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', fontSize: 22, color: '#9ca3af' }}>
                0 $BASE, empty bag
              </div>
            )}
            <div
              style={{
                display: 'flex',
                padding: '18px 28px',
                background: '#ffffff',
                border: '1px solid rgba(0,82,255,0.18)',
                borderRadius: 999,
                fontSize: 24,
                fontWeight: 500,
                color: '#0a0a0c',
                fontFamily: '"Base Mono", monospace',
                letterSpacing: '-0.04em',
              }}
            >
              Score {score} / {max}
            </div>
          </div>

          {/* Footer */}
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
              src={fashakingUri}
              width={28}
              height={28}
              alt=""
              style={{ borderRadius: 999 }}
            />
            <span style={{ display: 'flex' }}>Built by</span>
            <span style={{ display: 'flex', fontWeight: 700, color: '#0a0a0c' }}>
              @fashaking
            </span>
            <span style={{ display: 'flex', color: '#a3a3a3', padding: '0 4px' }}>
              |
            </span>
            <span style={{ display: 'flex' }}>hypothetical estimate</span>
          </div>
        </div>
      ),
      {
        width: 1023,
        height: 537,
        fonts: [
          { name: 'Base Sans', data: baseSansBold, weight: 700, style: 'normal' },
          { name: 'Base Sans', data: baseSansBlack, weight: 900, style: 'normal' },
          { name: 'Base Mono', data: baseSansMonoRegular, weight: 400, style: 'normal' },
          { name: 'Base Mono', data: baseSansMonoMedium, weight: 500, style: 'normal' },
        ],
      },
    )

    // ImageResponse is a Web Response. Stream its body back to the Node res.
    const buf = Buffer.from(await image.arrayBuffer())
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    res.status(200).send(buf)
  } catch (err) {
    console.error('share-card error:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
