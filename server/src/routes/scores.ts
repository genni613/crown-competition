import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'

export const scoresRouter = Router()

// GET /api/scores/:seasonId/:memberId — 某人所有指标分数
scoresRouter.get('/:seasonId/:memberId', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const scores = await db.query(`
    SELECT isc.*, sd.dimension_name, sd.indicator_name, sd.dimension_weight,
           sd.indicator_weight, sd.data_source, sd.score_type
    FROM indicator_scores isc
    JOIN scoring_dimensions sd ON isc.dimension_id = sd.id
    WHERE isc.season_member_id = ?
  `, [req.params.memberId])
  res.json(scores)
}))

// PUT /api/scores/:seasonId/:memberId/:dimensionId — 录入/更新单个指标
scoresRouter.put('/:seasonId/:memberId/:dimensionId', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { raw_value, notes } = req.body
  const db = getDb()

  await db.execute(`
    INSERT INTO indicator_scores (season_member_id, dimension_id, raw_value, source, notes)
    VALUES (?, ?, ?, 'admin', ?)
    ON DUPLICATE KEY UPDATE
      raw_value = COALESCE(?, raw_value),
      notes = COALESCE(?, notes)
  `, [req.params.memberId, req.params.dimensionId, raw_value, notes, raw_value, notes])

  const score = await db.queryOne(
    'SELECT * FROM indicator_scores WHERE season_member_id = ? AND dimension_id = ?',
    [req.params.memberId, req.params.dimensionId]
  )
  res.json(score)
}))

// PUT /api/scores/:seasonId/:memberId/batch — 批量更新
scoresRouter.put('/:seasonId/:memberId/batch', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { scores } = req.body as { scores: { dimension_id: number; raw_value: number; notes?: string }[] }
  const db = getDb()

  for (const s of scores) {
    await db.execute(`
      INSERT INTO indicator_scores (season_member_id, dimension_id, raw_value, source, notes)
      VALUES (?, ?, ?, 'admin', ?)
      ON DUPLICATE KEY UPDATE
        raw_value = VALUES(raw_value),
        notes = COALESCE(VALUES(notes), notes)
    `, [req.params.memberId, s.dimension_id, s.raw_value, s.notes])
  }

  const allScores = await db.query(
    'SELECT * FROM indicator_scores WHERE season_member_id = ?',
    [req.params.memberId]
  )
  res.json(allScores)
}))

// GET /api/scores/:seasonId/summary — 全员分数总览
scoresRouter.get('/:seasonId/summary', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const summary = await db.query(`
    SELECT sm.id as member_id, sm.user_key, fu.name as user_name, sm.job_role,
           isc.dimension_id, sd.indicator_name, isc.raw_value, isc.threshold_score, isc.final_score
    FROM season_members sm
    JOIN feishu_user fu ON sm.user_key = fu.user_key
    LEFT JOIN indicator_scores isc ON isc.season_member_id = sm.id
    LEFT JOIN scoring_dimensions sd ON isc.dimension_id = sd.id
    WHERE sm.season_id = ?
    ORDER BY fu.name, sd.sort_order
  `, [req.params.seasonId])
  res.json(summary)
}))
