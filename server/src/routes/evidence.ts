import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer, { MulterError } from 'multer'
import { getDb } from '../db'
import { calculateThresholdScore } from '../utils/scoringFormulas'
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
  return currentUser.role === 'ADMIN' || currentUser.user_key === evidenceOwnerId
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

function ensureEvidenceAttachments(value: unknown): string[] {
  const attachmentUrls = normalizeAttachmentUrls(value)
  if (attachmentUrls.length === 0) {
    throw new Error('请至少上传一张举证图片')
  }
  return attachmentUrls
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
  const owner = await db.queryOne<{ user_key: string }>(`
    SELECT sm.user_key
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    WHERE es.attachment_urls LIKE ?
    LIMIT 1
  `, [`%${url}%`])

  if (!owner) {
    res.status(404).json({ error: '附件不存在' })
    return
  }

  if (!canAccessEvidence(req.currentUser, owner.user_key)) {
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
    SELECT es.*, sm.user_key, sm.season_id, fu.name as user_name,
           lr.comment as review_comment, lr.created_at as reviewed_at,
           lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN feishu_user fu ON sm.user_key = fu.user_key
    ${latestReviewJoin}
    WHERE es.status = 'pending'
    ORDER BY es.created_at DESC
  `)
  res.json(list.map(item => normalizeEvidenceRecord(item as Record<string, unknown>)))
}))

// GET /api/evidence/reviewed — 已审核记录
evidenceRouter.get('/reviewed', adminMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const list = await db.query(`
    SELECT es.*, sm.user_key, sm.season_id, s.name as season_name, fu.name as user_name,
           lr.comment as review_comment, lr.created_at as reviewed_at,
           lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN seasons s ON sm.season_id = s.id
    JOIN feishu_user fu ON sm.user_key = fu.user_key
    ${latestReviewJoin}
    WHERE es.status IN ('approved', 'rejected')
    ORDER BY COALESCE(lr.created_at, es.updated_at) DESC, es.id DESC
  `)
  res.json(list.map(item => normalizeEvidenceRecord(item as Record<string, unknown>)))
}))

async function listMyEvidence(req: Request, res: Response, seasonId?: string) {
  const db = getDb()

  const params: Array<string | number> = [req.currentUser.user_key]
  let seasonFilter = ''

  if (seasonId) {
    seasonFilter = ' AND sm.season_id = ?'
    params.push(seasonId)
  }

  const list = await db.query(
    `SELECT es.*, sm.season_id, s.name as season_name,
            lr.comment as review_comment, lr.created_at as reviewed_at,
            lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
     FROM evidence_submissions es
     JOIN season_members sm ON es.season_member_id = sm.id
     JOIN seasons s ON sm.season_id = s.id
     ${latestReviewJoin}
     WHERE sm.user_key = ?${seasonFilter}
     ORDER BY es.created_at DESC`,
    params
  )

  res.json(list.map(item => normalizeEvidenceRecord(item as Record<string, unknown>)))
}

// GET /api/evidence/mine — 我的举证（全部赛季）
evidenceRouter.get('/mine', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await listMyEvidence(req, res)
}))

// GET /api/evidence/mine/:seasonId — 我的举证（指定赛季，兼容旧调用）
evidenceRouter.get('/mine/:seasonId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await listMyEvidence(req, res, req.params.seasonId)
}))

// POST /api/evidence — 提交举证
evidenceRouter.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { season_member_id, target_type, target_id, title, description, attachment_urls } = req.body
  if (!season_member_id || !title) {
    res.status(400).json({ error: '缺少必要字段' })
    return
  }

  const db = getDb()
  const member = await db.queryOne<{ user_key: string }>(
    'SELECT * FROM season_members WHERE id = ?',
    [season_member_id]
  )
  if (!member || member.user_key !== req.currentUser.user_key) {
    res.status(403).json({ error: '无权操作' })
    return
  }

  let attachmentList: string[]
  try {
    attachmentList = ensureEvidenceAttachments(attachment_urls)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '举证图片校验失败' })
    return
  }
  const raw_value = req.body.raw_value != null ? Number(req.body.raw_value) : null
  const snapshot = {
    submitted_by: req.currentUser.id,
    season_member_id,
    target_type: target_type || 'indicator',
    target_id: target_id ?? null,
    raw_value,
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
    const evidence = await db.queryOne<{
      target_type: string; target_id: number | null;
      season_member_id: number; snapshot_json: string | null
    }>(
      'SELECT * FROM evidence_submissions WHERE id = ?',
      [req.params.id]
    )
    if (evidence?.target_type === 'indicator' && evidence?.target_id) {
      const snapshot = typeof evidence.snapshot_json === 'string' ? JSON.parse(evidence.snapshot_json) : (evidence.snapshot_json ?? {})
      const rawValue = snapshot.raw_value ?? null
      const dimensionId = evidence.target_id

      // 读取维度规则
      const dim = await db.queryOne<{
        threshold_100: number | null; threshold_60: number | null; score_type: string
      }>('SELECT * FROM scoring_dimensions WHERE id = ?', [dimensionId])

      let thresholdScore: number | null = null
      let finalScore: number | null = null
      if (dim && rawValue != null && dim.threshold_100 != null && dim.threshold_60 != null) {
        thresholdScore = calculateThresholdScore(rawValue, dim.threshold_100, dim.threshold_60)
        finalScore = thresholdScore
      }

      // 查找或创建 indicator_scores 行
      const existing = await db.queryOne<{ id: number }>(
        'SELECT id FROM indicator_scores WHERE season_member_id = ? AND dimension_id = ?',
        [evidence.season_member_id, dimensionId]
      )
      if (existing) {
        await db.execute(
          'UPDATE indicator_scores SET raw_value = ?, threshold_score = ?, final_score = ?, source = ?, approved = 1 WHERE id = ?',
          [rawValue, thresholdScore, finalScore, 'evidence', existing.id]
        )
      } else {
        await db.execute(
          'INSERT INTO indicator_scores (season_member_id, dimension_id, raw_value, threshold_score, final_score, source, approved) VALUES (?, ?, ?, ?, ?, ?, 1)',
          [evidence.season_member_id, dimensionId, rawValue, thresholdScore, finalScore, 'evidence']
        )
      }
    }
  }

  res.json({ ok: true })
}))

// GET /api/evidence/:id — 举证详情
evidenceRouter.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const evidence = await db.queryOne<{
    user_key: string
    [key: string]: unknown
  }>(`
    SELECT es.*, sm.user_key, fu.name as user_name,
           lr.comment as review_comment, lr.created_at as reviewed_at,
           lr.snapshot_json as review_snapshot_json, reviewer.name as reviewer_name
    FROM evidence_submissions es
    JOIN season_members sm ON es.season_member_id = sm.id
    JOIN feishu_user fu ON sm.user_key = fu.user_key
    ${latestReviewJoin}
    WHERE es.id = ?
  `, [req.params.id])
  if (!evidence) { res.status(404).json({ error: '不存在' }); return }

  if (!canAccessEvidence(req.currentUser, evidence.user_key)) {
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

  const member = await db.queryOne<{ user_key: string }>(
    'SELECT * FROM season_members WHERE id = ?',
    [evidence.season_member_id]
  )
  if (!member || member.user_key !== req.currentUser.user_key) {
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
