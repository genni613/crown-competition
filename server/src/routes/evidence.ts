import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer, { MulterError } from 'multer'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'

export const evidenceRouter = Router()

const uploadRoot = path.resolve(process.cwd(), 'data', 'uploads', 'evidence')
fs.mkdirSync(uploadRoot, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safeExt = ext && ext.length <= 10 ? ext : '.bin'
    cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('只能上传图片文件'))
      return
    }
    cb(null, true)
  },
})

function canAccessEvidence(currentUser: any, evidenceOwnerId: string) {
  if (!currentUser) return false
  return currentUser.role === 'ADMIN' || currentUser.id === evidenceOwnerId
}

function normalizeAttachmentUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : []
  } catch {
    return []
  }
}

function normalizeEvidenceRecord<T extends Record<string, unknown>>(record: T): T & { attachment_urls: string[] } {
  return {
    ...record,
    attachment_urls: normalizeAttachmentUrls(record.attachment_urls),
    snapshot_json: typeof record.snapshot_json === 'string' && record.snapshot_json
      ? safeParseJson(record.snapshot_json)
      : record.snapshot_json ?? null,
    review_snapshot_json: typeof record.review_snapshot_json === 'string' && record.review_snapshot_json
      ? safeParseJson(record.review_snapshot_json)
      : record.review_snapshot_json ?? null,
  }
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const latestReviewJoin = `
  LEFT JOIN (
    SELECT er1.*
    FROM evidence_reviews er1
    INNER JOIN (
      SELECT evidence_submission_id, MAX(id) AS max_id
      FROM evidence_reviews
      GROUP BY evidence_submission_id
    ) latest ON latest.max_id = er1.id
  ) lr ON lr.evidence_submission_id = es.id
  LEFT JOIN users reviewer
    ON reviewer.id COLLATE utf8mb4_unicode_ci = lr.reviewer_id COLLATE utf8mb4_unicode_ci
`

function normalizeReviewRecord<T extends Record<string, unknown>>(record: T) {
  return {
    ...record,
    snapshot_json: typeof record.snapshot_json === 'string' && record.snapshot_json
      ? safeParseJson(record.snapshot_json)
      : record.snapshot_json ?? null,
  }
}

evidenceRouter.post('/attachments', authMiddleware, (req: Request, res: Response) => {
  upload.single('file')(req, res, (err?: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: '图片不能超过 5MB' })
        return
      }
      res.status(400).json({ error: err.message })
      return
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: '缺少上传文件' })
      return
    }

    res.status(201).json({
      url: `/api/evidence/attachments/${req.file.filename}`,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    })
  })
})

evidenceRouter.get('/attachments/:filename', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename || '')
  if (!filename || filename !== req.params.filename) {
    res.status(400).json({ error: '无效文件名' })
    return
  }

  const url = `/api/evidence/attachments/${filename}`
  const db = getDb()
  const owner = await db.queryOne<{ user_id: string }>(`
    SELECT sm.user_id
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    WHERE es.attachment_urls LIKE ?
    LIMIT 1
  `, [`%${url}%`])

  if (!owner) {
    res.status(404).json({ error: '附件不存在' })
    return
  }

  if (!canAccessEvidence(req.currentUser, owner.user_id)) {
    res.status(403).json({ error: '无权查看' })
    return
  }

  const filePath = path.join(uploadRoot, filename)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: '附件不存在' })
    return
  }

  res.sendFile(filePath)
}))

// GET /api/evidence/pending — 待审核列表
evidenceRouter.get('/pending', adminMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const list = await db.query(`
    SELECT es.*, sm.user_id, sm.season_id, u.name as user_name,
           lr.comment as review_comment, lr.created_at as reviewed_at,
           lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN users u ON sm.user_id = u.id
    ${latestReviewJoin}
    WHERE es.status = 'pending'
    ORDER BY es.created_at DESC
  `)
  res.json(list.map(item => normalizeEvidenceRecord(item as Record<string, unknown>)))
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
    `SELECT es.*, lr.comment as review_comment, lr.created_at as reviewed_at,
            lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
     FROM evidence_submissions es
     ${latestReviewJoin}
     WHERE es.season_member_id = ?
     ORDER BY es.created_at DESC`,
    [member.id]
  )
  res.json(list.map(item => normalizeEvidenceRecord(item as Record<string, unknown>)))
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

  const attachmentList = attachment_urls || []
  const snapshot = {
    submitted_by: req.currentUser.id,
    season_member_id,
    target_type: target_type || 'indicator',
    target_id: target_id ?? null,
    title,
    description: description ?? null,
    attachment_urls: attachmentList,
    created_at: new Date().toISOString(),
  }

  const result = await db.execute(`
    INSERT INTO evidence_submissions (season_member_id, target_type, target_id, title, description, attachment_urls, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    season_member_id, target_type || 'indicator', target_id,
    title, description, JSON.stringify(attachmentList), JSON.stringify(snapshot)
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
  const reviewSnapshot = {
    reviewed_by: req.currentUser.id,
    action: status,
    comment: review_comment ?? null,
    reviewed_at: new Date().toISOString(),
  }
  await db.execute(
    'UPDATE evidence_submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, req.params.id]
  )
  await db.execute(`
    INSERT INTO evidence_reviews (evidence_submission_id, reviewer_id, action, comment, snapshot_json)
    VALUES (?, ?, ?, ?, ?)
  `, [req.params.id, req.currentUser.id, status, review_comment ?? null, JSON.stringify(reviewSnapshot)])

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
    SELECT es.*, sm.user_id, u.name as user_name,
           lr.comment as review_comment, lr.created_at as reviewed_at,
           lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN users u ON sm.user_id = u.id
    ${latestReviewJoin}
    WHERE es.id = ?
  `, [req.params.id])
  if (!evidence) { res.status(404).json({ error: '不存在' }); return }

  if (!canAccessEvidence(req.currentUser, evidence.user_id)) {
    res.status(403).json({ error: '无权查看' })
    return
  }

  const reviewHistory = await db.query(`
    SELECT er.*, reviewer.name as reviewer_name
    FROM evidence_reviews er
    JOIN users reviewer
      ON reviewer.id COLLATE utf8mb4_unicode_ci = er.reviewer_id COLLATE utf8mb4_unicode_ci
    WHERE er.evidence_submission_id = ?
    ORDER BY er.created_at DESC, er.id DESC
  `, [req.params.id])

  res.json({
    ...normalizeEvidenceRecord(evidence),
    review_history: reviewHistory.map(item => normalizeReviewRecord(item as Record<string, unknown>)),
  })
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
