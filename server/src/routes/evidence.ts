import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'

export const evidenceRouter = Router()

function canAccessEvidence(currentUser: any, evidenceOwnerId: string) {
  if (!currentUser) return false
  return currentUser.role === 'ADMIN' || currentUser.id === evidenceOwnerId
}

// GET /api/evidence/pending — 待审核列表
evidenceRouter.get('/pending', adminMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const list = await db.query(`
    SELECT es.*, sm.user_id, sm.season_id, u.name as user_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN users u ON sm.user_id = u.id
    WHERE es.status = 'pending'
    ORDER BY es.created_at DESC
  `)
  res.json(list)
}))

// GET /api/evidence/mine/:seasonId — 我的举证
evidenceRouter.get('/mine/:seasonId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const member = await db.queryOne<{ id: number }>(
    'SELECT id FROM season_members WHERE user_id = ? AND season_id = ?',
    [req.currentUser.id, req.params.seasonId]
  )

  if (!member) { res.json([]); return }

  const list = await db.query(
    'SELECT * FROM evidence_submissions WHERE season_member_id = ? ORDER BY created_at DESC',
    [member.id]
  )
  res.json(list)
}))

// POST /api/evidence — 提交举证
evidenceRouter.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { season_member_id, target_type, target_id, title, description, attachment_urls } = req.body
  if (!season_member_id || !title) {
    res.status(400).json({ error: '缺少必要字段' })
    return
  }

  const db = getDb()
  const member = await db.queryOne<{ user_id: string }>(
    'SELECT * FROM season_members WHERE id = ?',
    [season_member_id]
  )
  if (!member || member.user_id !== req.currentUser.id) {
    res.status(403).json({ error: '无权操作' })
    return
  }

  const result = await db.execute(`
    INSERT INTO evidence_submissions (season_member_id, target_type, target_id, title, description, attachment_urls)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    season_member_id, target_type || 'indicator', target_id,
    title, description, JSON.stringify(attachment_urls || [])
  ])

  res.status(201).json({ id: result.insertId })
}))

// PUT /api/evidence/:id/status — 审核通过/驳回
evidenceRouter.put('/:id/status', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { status, review_comment } = req.body
  if (!['approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: '无效状态' })
    return
  }

  const db = getDb()
  await db.execute(`
    UPDATE evidence_submissions SET status = ?, review_comment = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, review_comment, req.currentUser.id, req.params.id])

  if (status === 'approved') {
    const evidence = await db.queryOne<{ target_type: string; target_id?: number }>(
      'SELECT * FROM evidence_submissions WHERE id = ?',
      [req.params.id]
    )
    if (evidence?.target_type === 'indicator' && evidence?.target_id) {
      await db.execute('UPDATE indicator_scores SET approved = 1 WHERE id = ?', [evidence.target_id])
    }
  }

  res.json({ ok: true })
}))

// GET /api/evidence/:id — 举证详情
evidenceRouter.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const evidence = await db.queryOne<{
    user_id: string
    [key: string]: unknown
  }>(`
    SELECT es.*, sm.user_id, u.name as user_name FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN users u ON sm.user_id = u.id
    WHERE es.id = ?
  `, [req.params.id])
  if (!evidence) { res.status(404).json({ error: '不存在' }); return }

  if (!canAccessEvidence(req.currentUser, evidence.user_id)) {
    res.status(403).json({ error: '无权查看' })
    return
  }

  res.json(evidence)
}))

// DELETE /api/evidence/:id — 撤回举证
evidenceRouter.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const evidence = await db.queryOne<{ season_member_id: number; status: string }>(
    'SELECT * FROM evidence_submissions WHERE id = ?',
    [req.params.id]
  )
  if (!evidence) { res.status(404).json({ error: '不存在' }); return }

  const member = await db.queryOne<{ user_id: string }>(
    'SELECT * FROM season_members WHERE id = ?',
    [evidence.season_member_id]
  )
  if (!member || member.user_id !== req.currentUser.id) {
    res.status(403).json({ error: '无权操作' })
    return
  }
  if (evidence.status !== 'pending') {
    res.status(400).json({ error: '只能撤回待审核的举证' })
    return
  }

  await db.execute('DELETE FROM evidence_submissions WHERE id = ?', [req.params.id])
  res.json({ ok: true })
}))
