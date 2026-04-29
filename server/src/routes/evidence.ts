import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'

export const evidenceRouter = Router()

// GET /api/evidence/pending — 待审核列表
evidenceRouter.get('/pending', adminMiddleware, (_req: Request, res: Response) => {
  const db = getDb()
  const list = db.prepare(`
    SELECT es.*, sm.user_id, sm.season_id, u.name as user_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN users u ON sm.user_id = u.id
    WHERE es.status = 'pending'
    ORDER BY es.created_at DESC
  `).all()
  res.json(list)
})

// GET /api/evidence/mine/:seasonId — 我的举证
evidenceRouter.get('/mine/:seasonId', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const member = db.prepare(
    'SELECT id FROM season_members WHERE user_id = ? AND season_id = ?'
  ).get(req.currentUser.id, req.params.seasonId) as any

  if (!member) { res.json([]); return }

  const list = db.prepare(
    'SELECT * FROM evidence_submissions WHERE season_member_id = ? ORDER BY created_at DESC'
  ).all(member.id)
  res.json(list)
})

// POST /api/evidence — 提交举证
evidenceRouter.post('/', authMiddleware, (req: Request, res: Response) => {
  const { season_member_id, target_type, target_id, title, description, attachment_urls } = req.body
  if (!season_member_id || !title) {
    res.status(400).json({ error: '缺少必要字段' })
    return
  }

  const db = getDb()
  // 验证是自己的
  const member = db.prepare('SELECT * FROM season_members WHERE id = ?').get(season_member_id) as any
  if (!member || member.user_id !== req.currentUser.id) {
    res.status(403).json({ error: '无权操作' })
    return
  }

  const result = db.prepare(`
    INSERT INTO evidence_submissions (season_member_id, target_type, target_id, title, description, attachment_urls)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    season_member_id, target_type || 'indicator', target_id,
    title, description, JSON.stringify(attachment_urls || [])
  )

  res.status(201).json({ id: result.lastInsertRowid })
})

// PUT /api/evidence/:id/status — 审核通过/驳回
evidenceRouter.put('/:id/status', adminMiddleware, (req: Request, res: Response) => {
  const { status, review_comment } = req.body
  if (!['approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: '无效状态' })
    return
  }

  const db = getDb()
  db.prepare(`
    UPDATE evidence_submissions SET status = ?, review_comment = ?, reviewed_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, review_comment, req.currentUser.id, req.params.id)

  // 如果通过，更新对应指标的分数
  if (status === 'approved') {
    const evidence = db.prepare('SELECT * FROM evidence_submissions WHERE id = ?').get(req.params.id) as any
    if (evidence?.target_type === 'indicator' && evidence?.target_id) {
      db.prepare('UPDATE indicator_scores SET approved = 1 WHERE id = ?').run(evidence.target_id)
    }
  }

  res.json({ ok: true })
})

// GET /api/evidence/:id — 举证详情
evidenceRouter.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const evidence = db.prepare(`
    SELECT es.*, u.name as user_name FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN users u ON sm.user_id = u.id
    WHERE es.id = ?
  `).get(req.params.id)
  if (!evidence) { res.status(404).json({ error: '不存在' }); return }
  res.json(evidence)
})

// DELETE /api/evidence/:id — 撤回举证
evidenceRouter.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const evidence = db.prepare('SELECT * FROM evidence_submissions WHERE id = ?').get(req.params.id) as any
  if (!evidence) { res.status(404).json({ error: '不存在' }); return }

  // 验证是自己的且状态为 pending
  const member = db.prepare('SELECT * FROM season_members WHERE id = ?').get(evidence.season_member_id) as any
  if (!member || member.user_id !== req.currentUser.id) {
    res.status(403).json({ error: '无权操作' })
    return
  }
  if (evidence.status !== 'pending') {
    res.status(400).json({ error: '只能撤回待审核的举证' })
    return
  }

  db.prepare('DELETE FROM evidence_submissions WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})
