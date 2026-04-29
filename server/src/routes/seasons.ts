import { Router, Request, Response } from 'express'
import { getDb } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { getPerformanceScore } from '../utils/constants'
import type { Season, SeasonMember, SeasonMemberDetail } from '../types/entities'

export const seasonsRouter = Router()

// GET /api/seasons — 赛季列表
seasonsRouter.get('/', authMiddleware, (_req: Request, res: Response) => {
  const db = getDb()
  const seasons = db.prepare('SELECT * FROM seasons ORDER BY created_at DESC').all()
  res.json(seasons)
})

// GET /api/seasons/:id — 赛季详情
seasonsRouter.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id)
  if (!season) { res.status(404).json({ error: '赛季不存在' }); return }
  res.json(season)
})

// POST /api/seasons — 创建赛季
seasonsRouter.post('/', adminMiddleware, (req: Request, res: Response) => {
  const { name, start_date, end_date } = req.body
  if (!name || !start_date || !end_date) {
    res.status(400).json({ error: '缺少必要字段' })
    return
  }
  const db = getDb()
  try {
    const result = db.prepare(
      'INSERT INTO seasons (name, start_date, end_date) VALUES (?, ?, ?)'
    ).run(name, start_date, end_date)
    const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(season)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: '赛季名称已存在' })
      return
    }
    throw err
  }
})

// PUT /api/seasons/:id — 编辑赛季
seasonsRouter.put('/:id', adminMiddleware, (req: Request, res: Response) => {
  const { name, start_date, end_date } = req.body
  const db = getDb()
  db.prepare(
    `UPDATE seasons SET name = COALESCE(?, name), start_date = COALESCE(?, start_date),
     end_date = COALESCE(?, end_date), updated_at = datetime('now') WHERE id = ?`
  ).run(name, start_date, end_date, req.params.id)
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id)
  res.json(season)
})

// POST /api/seasons/:id/activate — 激活赛季
seasonsRouter.post('/:id/activate', adminMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  // 先将所有 active 赛季设为 draft
  db.prepare("UPDATE seasons SET status = 'draft' WHERE status = 'active'").run()
  db.prepare("UPDATE seasons SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(req.params.id)
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id)
  res.json(season)
})

// POST /api/seasons/:id/end — 结束赛季
seasonsRouter.post('/:id/end', adminMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  db.prepare("UPDATE seasons SET status = 'ended', updated_at = datetime('now') WHERE id = ?").run(req.params.id)
  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id)
  res.json(season)
})

// GET /api/seasons/:id/members — 赛季成员列表
seasonsRouter.get('/:id/members', authMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  const members = db.prepare(`
    SELECT sm.*, u.name as user_name, u.avatar_url as user_avatar_url,
           u.department_name as user_department_name, u.title as user_title
    FROM season_members sm
    JOIN users u ON sm.user_id = u.id
    WHERE sm.season_id = ?
    ORDER BY sm.rank IS NULL, sm.rank ASC
  `).all(req.params.id)
  res.json(members)
})

// POST /api/seasons/:id/members — 添加成员
seasonsRouter.post('/:id/members', adminMiddleware, (req: Request, res: Response) => {
  const { user_id, job_role, performance_grade } = req.body
  if (!user_id) { res.status(400).json({ error: '缺少 user_id' }); return }

  const db = getDb()
  const seasonId = parseInt(req.params.id)

  // 计算首赛季初始分
  const prevRawScore = performance_grade ? getPerformanceScore(performance_grade) : null

  try {
    const result = db.prepare(
      'INSERT INTO season_members (season_id, user_id, job_role, performance_grade, prev_raw_score) VALUES (?, ?, ?, ?, ?)'
    ).run(seasonId, user_id, job_role, performance_grade, prevRawScore)

    // 初始化该成员的指标得分记录
    const memberId = result.lastInsertRowid
    const dimensions = db.prepare(
      'SELECT id FROM scoring_dimensions WHERE job_role = ?'
    ).all(job_role) as any[]

    const insertScore = db.prepare(
      'INSERT OR IGNORE INTO indicator_scores (season_member_id, dimension_id, source) VALUES (?, ?, ?)'
    )
    for (const dim of dimensions) {
      insertScore.run(memberId, dim.id, dim.data_source || 'admin')
    }

    const member = db.prepare('SELECT * FROM season_members WHERE id = ?').get(memberId)
    res.status(201).json(member)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: '该成员已在此赛季中' })
      return
    }
    throw err
  }
})

// PUT /api/seasons/:id/members/:mid — 编辑成员
seasonsRouter.put('/:id/members/:mid', adminMiddleware, (req: Request, res: Response) => {
  const { job_role, performance_grade } = req.body
  const db = getDb()
  const prevRawScore = performance_grade ? getPerformanceScore(performance_grade) : undefined

  db.prepare(`
    UPDATE season_members SET
      job_role = COALESCE(?, job_role),
      performance_grade = COALESCE(?, performance_grade),
      prev_raw_score = COALESCE(?, prev_raw_score)
    WHERE id = ? AND season_id = ?
  `).run(job_role, performance_grade, prevRawScore, req.params.mid, req.params.id)

  const member = db.prepare('SELECT * FROM season_members WHERE id = ?').get(req.params.mid)
  res.json(member)
})

// DELETE /api/seasons/:id/members/:mid — 移除成员
seasonsRouter.delete('/:id/members/:mid', adminMiddleware, (req: Request, res: Response) => {
  const db = getDb()
  db.prepare('DELETE FROM season_members WHERE id = ? AND season_id = ?').run(req.params.mid, req.params.id)
  res.json({ ok: true })
})
