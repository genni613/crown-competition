import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'

export const orgScoresRouter = Router()

// GET /api/org-scores/types — 组织分类型列表
orgScoresRouter.get('/types', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const types = await db.query('SELECT * FROM org_score_types ORDER BY sort_order')
  res.json(types)
}))

// GET /api/org-scores/:seasonId/:memberId — 某人组织分
orgScoresRouter.get('/:seasonId/:memberId', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const scores = await db.query(`
    SELECT os.*, ost.display_name, ost.points_per_unit, ost.max_per_season
    FROM org_scores os
    JOIN org_score_types ost ON os.org_score_type_id = ost.id
    WHERE os.season_member_id = ?
    ORDER BY ost.sort_order
  `, [req.params.memberId])
  res.json(scores)
}))

// POST /api/org-scores/:seasonId/:memberId — 新增组织分
orgScoresRouter.post('/:seasonId/:memberId', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { org_score_type_id, quantity, description } = req.body
  if (!org_score_type_id) { res.status(400).json({ error: '缺少组织分类型' }); return }

  const db = getDb()
  const type = await db.queryOne<{ points_per_unit: number; max_per_season?: number }>(
    'SELECT * FROM org_score_types WHERE id = ?',
    [org_score_type_id]
  )
  if (!type) { res.status(404).json({ error: '类型不存在' }); return }

  const qty = quantity || 1
  const points = qty * type.points_per_unit

  if (type.max_per_season) {
    const currentTotal = (await db.queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND org_score_type_id = ?',
      [req.params.memberId, org_score_type_id]
    ))?.total ?? 0
    if (currentTotal + points > type.max_per_season * type.points_per_unit) {
      const cappedPoints = Math.max(0, type.max_per_season * type.points_per_unit - currentTotal)
      if (cappedPoints <= 0) {
        res.status(400).json({ error: `已达封顶值 ${type.max_per_season * type.points_per_unit} 分` })
        return
      }
    }
  }

  const result = await db.execute(`
    INSERT INTO org_scores (season_member_id, org_score_type_id, quantity, points, description, status, submitted_by)
    VALUES (?, ?, ?, ?, ?, 'approved', ?)
  `, [req.params.memberId, org_score_type_id, qty, points, description, req.currentUser.id])

  const totalOrg = (await db.queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND status = 'approved'",
    [req.params.memberId]
  ))?.total ?? 0
  await db.execute('UPDATE season_members SET total_org_score = ? WHERE id = ?', [Math.min(totalOrg, 25), req.params.memberId])

  res.status(201).json({ id: result.insertId, points })
}))

// PUT /api/org-scores/:id — 编辑组织分
orgScoresRouter.put('/:id', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { quantity, description } = req.body
  const db = getDb()

  const existing = await db.queryOne<{
    season_member_id: number
    org_score_type_id: number
    quantity: number
    description?: string
  }>('SELECT * FROM org_scores WHERE id = ?', [req.params.id])
  if (!existing) { res.status(404).json({ error: '不存在' }); return }

  const type = await db.queryOne<{ points_per_unit: number }>(
    'SELECT * FROM org_score_types WHERE id = ?',
    [existing.org_score_type_id]
  )
  const qty = quantity ?? existing.quantity
  const points = qty * (type?.points_per_unit ?? 0)

  await db.execute(
    'UPDATE org_scores SET quantity = ?, points = ?, description = ? WHERE id = ?',
    [qty, points, description ?? existing.description, req.params.id]
  )

  const totalOrg = (await db.queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND status = 'approved'",
    [existing.season_member_id]
  ))?.total ?? 0
  await db.execute('UPDATE season_members SET total_org_score = LEAST(?, 25) WHERE id = ?', [totalOrg, existing.season_member_id])

  res.json({ ok: true })
}))

// DELETE /api/org-scores/:id — 删除组织分
orgScoresRouter.delete('/:id', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const existing = await db.queryOne<{ season_member_id: number }>('SELECT * FROM org_scores WHERE id = ?', [req.params.id])
  if (!existing) { res.status(404).json({ error: '不存在' }); return }

  await db.execute('DELETE FROM org_scores WHERE id = ?', [req.params.id])

  const totalOrg = (await db.queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND status = 'approved'",
    [existing.season_member_id]
  ))?.total ?? 0
  await db.execute('UPDATE season_members SET total_org_score = LEAST(?, 25) WHERE id = ?', [totalOrg, existing.season_member_id])

  res.json({ ok: true })
}))

// GET /api/org-scores/:seasonId/summary — 全员组织分总览
orgScoresRouter.get('/:seasonId/summary', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const summary = await db.query(`
    SELECT sm.id as member_id, sm.user_id, u.name as user_name, sm.total_org_score,
           os.org_score_type_id, ost.display_name, os.points
    FROM season_members sm
    JOIN users u ON sm.user_id = u.id
    LEFT JOIN org_scores os ON os.season_member_id = sm.id AND os.status = 'approved'
    LEFT JOIN org_score_types ost ON os.org_score_type_id = ost.id
    WHERE sm.season_id = ?
    ORDER BY u.name, ost.sort_order
  `, [req.params.seasonId])
  res.json(summary)
}))
