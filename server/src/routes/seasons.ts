import { Router, Request, Response } from 'express'
import { getDb, withTransaction } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { getPerformanceScore } from '../utils/constants'

export const seasonsRouter = Router()

// GET /api/seasons — 赛季列表
seasonsRouter.get('/', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const seasons = await db.query('SELECT * FROM seasons ORDER BY created_at DESC')
  res.json(seasons)
}))

// GET /api/seasons/:id — 赛季详情
seasonsRouter.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const season = await db.queryOne('SELECT * FROM seasons WHERE id = ?', [req.params.id])
  if (!season) { res.status(404).json({ error: '赛季不存在' }); return }
  res.json(season)
}))

// POST /api/seasons — 创建赛季
seasonsRouter.post('/', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { name, start_date, end_date } = req.body
  if (!name || !start_date || !end_date) {
    res.status(400).json({ error: '缺少必要字段' })
    return
  }

  const db = getDb()
  try {
    const result = await db.execute(
      'INSERT INTO seasons (name, start_date, end_date) VALUES (?, ?, ?)',
      [name, start_date, end_date]
    )
    const season = await db.queryOne('SELECT * FROM seasons WHERE id = ?', [result.insertId])
    res.status(201).json(season)
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate')) {
      res.status(409).json({ error: '赛季名称已存在' })
      return
    }
    throw err
  }
}))

// PUT /api/seasons/:id — 编辑赛季
seasonsRouter.put('/:id', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { name, start_date, end_date } = req.body
  const db = getDb()
  await db.execute(
    `UPDATE seasons SET name = COALESCE(?, name), start_date = COALESCE(?, start_date),
     end_date = COALESCE(?, end_date), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, start_date, end_date, req.params.id]
  )
  const season = await db.queryOne('SELECT * FROM seasons WHERE id = ?', [req.params.id])
  res.json(season)
}))

// POST /api/seasons/:id/activate — 激活赛季
seasonsRouter.post('/:id/activate', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  await db.execute("UPDATE seasons SET status = 'draft' WHERE status = 'active'")
  await db.execute("UPDATE seasons SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id])
  const season = await db.queryOne('SELECT * FROM seasons WHERE id = ?', [req.params.id])
  res.json(season)
}))

// POST /api/seasons/:id/end — 结束赛季
seasonsRouter.post('/:id/end', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  await db.execute("UPDATE seasons SET status = 'ended', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id])
  const season = await db.queryOne('SELECT * FROM seasons WHERE id = ?', [req.params.id])
  res.json(season)
}))

// GET /api/seasons/:id/members — 赛季成员列表
seasonsRouter.get('/:id/members', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  const members = await db.query(
    'SELECT sm.*, fu.name as user_name, fu.avatar_url as user_avatar_url ' +
    'FROM season_members sm ' +
    'JOIN feishu_user fu ON sm.user_key = fu.user_key ' +
    'WHERE sm.season_id = ? ' +
    'ORDER BY sm.`rank` IS NULL, sm.`rank` ASC',
    [req.params.id]
  )
  res.json(members)
}))

// POST /api/seasons/:id/members — 添加成员
seasonsRouter.post('/:id/members', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { user_key, job_role, performance_grade } = req.body
  if (!user_key) { res.status(400).json({ error: '缺少 user_key' }); return }

  const seasonId = parseInt(req.params.id, 10)
  const prevRawScore = performance_grade ? getPerformanceScore(performance_grade) : null

  try {
    const memberId = await withTransaction(async tx => {
      const result = await tx.execute(
        'INSERT INTO season_members (season_id, user_key, job_role, performance_grade, prev_raw_score) VALUES (?, ?, ?, ?, ?)',
        [seasonId, user_key, job_role, performance_grade, prevRawScore]
      )
      const dimensions = await tx.query<{ id: number; data_source?: string }>(
        'SELECT id, data_source FROM scoring_dimensions WHERE job_role = ?',
        [job_role]
      )

      for (const dim of dimensions) {
        await tx.execute(
          'INSERT IGNORE INTO indicator_scores (season_member_id, dimension_id, source) VALUES (?, ?, ?)',
          [result.insertId, dim.id, dim.data_source || 'admin']
        )
      }

      return result.insertId
    })

    const member = await getDb().queryOne('SELECT * FROM season_members WHERE id = ?', [memberId])
    res.status(201).json(member)
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate')) {
      res.status(409).json({ error: '该成员已在此赛季中' })
      return
    }
    throw err
  }
}))

// PUT /api/seasons/:id/members/:mid — 编辑成员
seasonsRouter.put('/:id/members/:mid', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { job_role, performance_grade } = req.body
  const db = getDb()
  const prevRawScore = performance_grade ? getPerformanceScore(performance_grade) : undefined

  await db.execute(`
    UPDATE season_members SET
      job_role = COALESCE(?, job_role),
      performance_grade = COALESCE(?, performance_grade),
      prev_raw_score = COALESCE(?, prev_raw_score)
    WHERE id = ? AND season_id = ?
  `, [job_role, performance_grade, prevRawScore, req.params.mid, req.params.id])

  const member = await db.queryOne('SELECT * FROM season_members WHERE id = ?', [req.params.mid])
  res.json(member)
}))

// DELETE /api/seasons/:id/members/:mid — 移除成员
seasonsRouter.delete('/:id/members/:mid', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  await db.execute('DELETE FROM season_members WHERE id = ? AND season_id = ?', [req.params.mid, req.params.id])
  res.json({ ok: true })
}))
