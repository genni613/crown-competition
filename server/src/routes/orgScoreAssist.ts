import { Router, Request, Response } from 'express'
import { adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { resolveOrgScoreTypeMatch } from '../services/orgScoreMatch.service'

export const orgScoreAssistRouter = Router()

orgScoreAssistRouter.post('/match-type', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const scoreTypeHint = String(req.body?.scoreTypeHint || '').trim()
  if (!scoreTypeHint) {
    res.status(400).json({ error: '缺少 scoreTypeHint' })
    return
  }

  const result = await resolveOrgScoreTypeMatch(scoreTypeHint)
  res.json(result)
}))
