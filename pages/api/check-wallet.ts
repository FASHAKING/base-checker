import { NextApiRequest, NextApiResponse } from 'next'
import { checkWallet } from '../../lib/baseChecker'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const address = (req.query.address as string | undefined)?.trim()
  if (!address) {
    return res.status(400).json({ error: 'Missing address query param' })
  }

  try {
    const result = await checkWallet(address)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Check failed'
    return res.status(400).json({ error: message })
  }
}
