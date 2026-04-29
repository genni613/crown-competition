import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'

export const orgScoresRouter = Router()

// GET /api/org-scores/types — 组织分类型列表
orgScoresRouter.get('/types', authMiddleware, (_req: Request, res: Response) => {
  const db = getDb()
  const types = db.prepare('SELECT * FROM org_score_types ORDER BY sort_order').all()
  res.json(types)
})

// GET /api/org-scores/:seasonId/:memberId — 某人组织分
orgScoresRouter.get('/:seasonId/:memberId', adminMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const scores = db.prepare(`
    SELECT os.*, ost.display_name, ost.points_per_unit, ost.max_per_season
    FROM org_scores os
    JOIN org_score_types ost ON os.org_score_type_id = ost.id
    WHERE os.season_member_id = ?
    ORDER BY ost.sort_order
  `).all(req.params.memberId)
  res.json(scores)
})

// POST /api/org-scores/:seasonId/:memberId — 新增组织分
orgScoresRouter.post('/:seasonId/:memberId', adminMiddleware, (req: Request, res: Response) => {
  const { org_score_type_id, quantity, description } = req.body
  if (!org_score_type_id) { res.status(400).json({ error: '缺少组织分类型' }); return }

  const db = getDb()

  // 获取类型信息
  const type = db.prepare('SELECT * FROM org_score_types WHERE id = ?').get(org_score_type_id) as any
  if (!type) { res.status(404).json({ error: '类型不存在' }); return }

  const qty = quantity || 1
  const points = qty * type.points_per_unit

  // 检查封顶
  if (type.max_per_season) {
    const currentTotal = (db.prepare(
      'SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND org_score_type_id = ?'
    ).get(req.params.memberId, org_score_type_id) as any).total
    if (currentTotal + points > type.max_per_season * type.points_per_unit) {
      // 限制到封顶值
      const cappedPoints = Math.max(0, type.max_per_season * type.points_per_unit - currentTotal)
      if (cappedPoints <= 0) {
        res.status(400).json({ error: `已达封顶值 ${type.max_per_season * type.points_per_unit} 分` })
        return
      }
    }
  }

  const result = db.prepare(`
    INSERT INTO org_scores (season_member_id, org_score_type_id, quantity, points, description, status, submitted_by)
    VALUES (?, ?, ?, ?, ?, 'approved', ?)
  `).run(req.params.memberId, org_score_type_id, qty, points, description, req.currentUser.id)

  // 更新成员总组织分（封顶25）
  const totalOrg = (db.prepare(
    'SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND status = \'approved\''
  ).get(req.params.memberId) as any).total
  const cappedTotal = Math.min(totalOrg, 25)
  db.prepare('UPDATE season_members SET total_org_score = ? WHERE id = ?').run(cappedTotal, req.params.memberId)

  res.status(201).json({ id: result.lastInsertRowid, points })
})

// PUT /api/org-scores/:id — 编辑组织分
orgScoresRouter.put('/:id', adminMiddleware, (req: Request, res: Response) => {
  const { quantity, description } = req.body
  const db = getDb()

  const existing = db.prepare('SELECT * FROM org_scores WHERE id = ?').get(req.params.id) as any
  if (!existing) { res.status(404).json({ error: '不存在' }); return }

  const type = db.prepare('SELECT * FROM org_score_types WHERE id = ?').get(existing.org_score_type_id) as any
  const qty = quantity ?? existing.quantity
  const points = qty * type.points_per_unit

  db.prepare('UPDATE org_scores SET quantity = ?, points = ?, description = ? WHERE id = ?')
    .run(qty, points, description ?? existing.description, req.params.id)

  // 重新计算总组织分
  const totalOrg = (db.prepare(
    "SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND status = 'approved'"
  ).get(existing.season_member_id) as any).total
  db.prepare('UPDATE season_members SET total_org_score = MIN(?, 25) WHERE id = ?')
    .run(totalOrg, existing.season_member_id)

  res.json({ ok: true })
})

// DELETE /api/org-scores/:id — 删除组织分
orgScoresRouter.delete('/:id', adminMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM org_scores WHERE id = ?').get(req.params.id) as any
  if (!existing) { res.status(404).json({ error: '不存在' }); return }

  db.prepare('DELETE FROM org_scores WHERE id = ?').run(req.params.id)

  // 重新计算总组织分
  const totalOrg = (db.prepare(
    "SELECT COALESCE(SUM(points), 0) as total FROM org_scores WHERE season_member_id = ? AND status = 'approved'"
  ).get(existing.season_member_id) as any).total
  db.prepare('UPDATE season_members SET total_org_score = MIN(?, 25) WHERE id = ?')
    .run(totalOrg, existing.season_member_id)

  res.json({ ok: true })
})

// GET /api/org-scores/:seasonId/summary — 全员组织分总览
orgScoresRouter.get('/:seasonId/summary', adminMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const summary = db.prepare(`
    SELECT sm.id as member_id, sm.user_id, u.name as user_name, sm.total_org_score,
           os.org_score_type_id, ost.display_name, os.points
    FROM season_members sm
    JOIN users u ON sm.user_id = u.id
    LEFT JOIN org_scores os ON os.season_member_id = sm.id AND os.status = 'approved'
    LEFT JOIN org_score_types ost ON os.org_score_type_id = ost.id
    WHERE sm.season_id = ?
    ORDER BY u.name, ost.sort_order
  `).all(req.params.seasonId)
  res.json(summary)
})
