import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { calculateSeasonScores } from '../services/scoring.service'
import type { SeasonMember } from '../types/entities'

export const scoringRouter = Router()

// GET /api/scoring/dimensions/:jobRole — 获取岗位评分维度定义
scoringRouter.get('/dimensions/:jobRole', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const dimensions = await db.query(
    'SELECT * FROM scoring_dimensions WHERE job_role = ? ORDER BY sort_order',
    [req.params.jobRole]
  )
  res.json(dimensions)
}))

// POST /api/scoring/calculate/:seasonId — 触发全赛季计算
scoringRouter.post('/calculate/:seasonId', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const seasonId = parseInt(req.params.seasonId, 10)
  const result = await calculateSeasonScores(seasonId)
  if (result.length === 0) {
    res.json({ message: '无成员需要计算' })
    return
  }
  res.json(result)
}))

// POST /api/scoring/calculate/:seasonId/:memberId — 计算单人
scoringRouter.post('/calculate/:seasonId/:memberId', adminMiddleware, (req: Request, res: Response) => {
  res.json({ message: '请使用全赛季计算接口' })
})

// GET /api/scoring/breakdown/:seasonId/:memberId — 分数详情
scoringRouter.get('/breakdown/:seasonId/:memberId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const member = await db.queryOne<SeasonMember>(
    'SELECT * FROM season_members WHERE id = ? AND season_id = ?',
    [req.params.memberId, req.params.seasonId]
  )

  if (!member) { res.status(404).json({ error: '成员不存在' }); return }

  if (req.currentUser?.role !== 'ADMIN' && req.currentUser?.user_key !== member.user_key) {
    res.status(403).json({ error: '无权查看' })
    return
  }

  const scores = await db.query(`
    SELECT sd.dimension_name, sd.indicator_name, sd.dimension_weight,
           sd.indicator_weight, sd.data_source, sd.score_type, sd.threshold_100, sd.threshold_60,
           sd.deduction_per_unit, sd.deduction_cap, sd.deduction_divisor,
           COALESCE(isc.id, 0) AS id,
           isc.season_member_id, isc.dimension_id,
           isc.raw_value, isc.threshold_score, isc.final_score,
           isc.source, isc.approved, isc.notes
    FROM scoring_dimensions sd
    LEFT JOIN indicator_scores isc ON isc.dimension_id = sd.id AND isc.season_member_id = ?
    WHERE sd.job_role = ?
    ORDER BY sd.sort_order
  `, [req.params.memberId, member.job_role])

  const user = await db.queryOne(
    'SELECT name, avatar_url FROM feishu_user WHERE user_key = ?',
    [member.user_key]
  )

  res.json({ member, user, scores })
}))

// GET /api/scoring/rankings/:seasonId — 全赛季排名
scoringRouter.get('/rankings/:seasonId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const rankings = await db.query(
    'SELECT sm.*, fu.name as user_name, fu.avatar_url as user_avatar_url ' +
    'FROM season_members sm ' +
    'JOIN feishu_user fu ON sm.user_key = fu.user_key ' +
    'WHERE sm.season_id = ? ' +
    'ORDER BY sm.`rank` IS NULL, sm.`rank` ASC',
    [req.params.seasonId]
  )
  res.json(rankings)
}))

// GET /api/scoring/rankings/:seasonId/:jobRole — 按岗位排名
scoringRouter.get('/rankings/:seasonId/:jobRole', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const rankings = await db.query(
    'SELECT sm.*, fu.name as user_name, fu.avatar_url as user_avatar_url ' +
    'FROM season_members sm ' +
    'JOIN feishu_user fu ON sm.user_key = fu.user_key ' +
    'WHERE sm.season_id = ? AND sm.job_role = ? ' +
    'ORDER BY sm.`rank` IS NULL, sm.`rank` ASC',
    [req.params.seasonId, req.params.jobRole]
  )
  res.json(rankings)
}))
