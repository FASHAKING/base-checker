import { NextApiRequest, NextApiResponse } from 'next'
import { checkWallet } from '../../lib/baseChecker'
import { resolveAddressOrName } from '../../lib/basename'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const input = (req.query.address as string | undefined)?.trim()
  const baseAppAddress = (req.query.baseApp as string | undefined)?.trim()
  const farcasterFid = (req.query.fid as string | undefined)?.trim()
  if (!input) {
    return res.status(400).json({ error: 'Missing address query param' })
  }

  try {
    // Resolve Basename / ENS if a name was provided instead of 0x...
    const { address, resolvedFrom } = await resolveAddressOrName(input)
    if (!address) {
      return res.status(400).json({
        error: input.includes('.')
          ? `Could not resolve "${input}". Is the name registered and pointing to an address?`
          : 'Invalid address, expected 0x… or yourname.base.eth',
      })
    }

    const result = await checkWallet(address, baseAppAddress, farcasterFid)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({ ...result, resolvedFrom })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Check failed'
    return res.status(400).json({ error: message })
  }
}
