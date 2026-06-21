// Farcaster lookup via Neynar API.
//
// Used by /checker as an optional bonus credit. If the user provides an FID,
// we fetch their profile and check whether the queried wallet is one of their
// verified Ethereum addresses. If it isn't, we ignore the FID — this prevents
// users from claiming arbitrary famous FIDs.

import { config } from './config'

export type FarcasterProfile = {
  fid: number
  username: string | null
  displayName: string | null
  followerCount: number
  followingCount: number
  powerBadge: boolean
  custodyAddress: string | null
  verifiedEthAddresses: string[]
  // Lower FID = earlier user. FID is incrementing, so it's a proxy for age.
  // Free Neynar tier doesn't expose creation timestamp directly, so we infer
  // age from the FID number against known anchors.
  fidAgeBucket: 'pre-launch' | 'early' | 'growth' | 'recent'
}

// Known FID anchors (approximate, based on Farcaster public history):
//   FID <= 10,000      → pre-launch / employee / OG (mid-2022)
//   FID <= 200,000     → early adopter (through ~Aug 2023)
//   FID <= 500,000     → growth phase (through ~early 2024)
//   FID >  500,000     → recent
function bucketFid(fid: number): FarcasterProfile['fidAgeBucket'] {
  if (fid <= 10_000) return 'pre-launch'
  if (fid <= 200_000) return 'early'
  if (fid <= 500_000) return 'growth'
  return 'recent'
}

export type FarcasterLookupResult =
  | { ok: true; profile: FarcasterProfile; walletLinked: boolean }
  | { ok: false; reason: string }

export async function lookupFarcaster(
  fidRaw: string | number,
  wallet: string,
): Promise<FarcasterLookupResult> {
  const fid = typeof fidRaw === 'string' ? parseInt(fidRaw, 10) : fidRaw
  if (!Number.isFinite(fid) || fid <= 0) {
    return { ok: false, reason: 'Invalid FID — must be a positive integer.' }
  }
  if (!config.neynarApiKey) {
    return {
      ok: false,
      reason: 'NEYNAR_API_KEY not configured — Farcaster bonus skipped.',
    }
  }

  try {
    const res = await fetch(
      `${config.neynarApiUrl}/farcaster/user/bulk?fids=${fid}`,
      {
        headers: {
          accept: 'application/json',
          'x-api-key': config.neynarApiKey,
        },
      },
    )
    if (!res.ok) {
      return { ok: false, reason: `Neynar lookup failed (${res.status}).` }
    }
    const data = await res.json()
    const user = data?.users?.[0]
    if (!user) return { ok: false, reason: 'FID not found.' }

    const verifiedEthAddresses: string[] = (
      user.verified_addresses?.eth_addresses ?? []
    ).map((a: string) => a.toLowerCase())

    const profile: FarcasterProfile = {
      fid: user.fid,
      username: user.username ?? null,
      displayName: user.display_name ?? null,
      followerCount: user.follower_count ?? 0,
      followingCount: user.following_count ?? 0,
      powerBadge: !!user.power_badge,
      custodyAddress: user.custody_address?.toLowerCase() ?? null,
      verifiedEthAddresses,
      fidAgeBucket: bucketFid(user.fid),
    }

    const walletLower = wallet.toLowerCase()
    const walletLinked =
      verifiedEthAddresses.includes(walletLower) ||
      profile.custodyAddress === walletLower

    return { ok: true, profile, walletLinked }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Neynar unreachable.'
    return { ok: false, reason: msg }
  }
}

// Scoring rule for the Farcaster bonus criterion.
// Tier 1 (+1): FID linked to wallet (verified address match)
// Tier 2 (+2): linked + (power badge OR 1000+ followers)
// Tier 3 (+3): linked + above + (early/pre-launch FID OR 500+ casts equivalent via follower:following ratio proxy)
export function scoreFarcaster(
  result: FarcasterLookupResult,
): { value: number; display: string } {
  if (!result.ok) return { value: 0, display: result.reason }
  if (!result.walletLinked) {
    return {
      value: 0,
      display: `FID ${result.profile.fid} — NOT linked to this wallet (ignored)`,
    }
  }

  const p = result.profile
  const highSocial = p.powerBadge || p.followerCount >= 1_000
  const earlyAdopter =
    p.fidAgeBucket === 'pre-launch' || p.fidAgeBucket === 'early'

  const handle = p.username ? `@${p.username}` : `FID ${p.fid}`
  const badge = p.powerBadge ? '⚡' : ''

  if (earlyAdopter && highSocial) {
    return {
      value: 3,
      display: `${handle} ${badge} · ${p.followerCount} followers · ${p.fidAgeBucket} FID`,
    }
  }
  if (highSocial) {
    return {
      value: 2,
      display: `${handle} ${badge} · ${p.followerCount} followers`,
    }
  }
  return {
    value: 1,
    display: `${handle} · linked (${p.followerCount} followers)`,
  }
}
