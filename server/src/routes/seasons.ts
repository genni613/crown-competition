import { Router, Request, Response } from 'express'
import { getDb, withTransaction } from '../db'
import type { DbExecutor } from '../db'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { getPerformanceScore } from '../utils/constants'

const PARTICIPANT_JOB_ROLES = ['product', 'design', 'tech'] as const

async function lookupPrevGrades(db: DbExecutor, userKeys: string[]): Promise<Record<string, string>> {
  if (userKeys.length === 0) return {}
  const lastEndedSeason = await db.queryOne<{ id: number }>(
    'SELECT id FROM seasons WHERE status = ? ORDER BY end_date DESC LIMIT 1',
    ['ended']
  )
  if (!lastEndedSeason) return {}
  const placeholders = userKeys.map(() => '?').join(',')
  const rows = await db.query<{ user_key: string; performance_grade: string }>(
    `SELECT user_key, performance_grade FROM season_members WHERE season_id = ? AND performance_grade IS NOT NULL AND user_key IN (${placeholders})`,
    [lastEndedSeason.id, ...userKeys]
  )
  const map: Record<string, string> = {}
  for (const row of rows) {
    map[row.user_key] = row.performance_grade
  }
  return map
}

export const seasonsRouter = Router()

// GET /api/seasons — 赛季列表
seasonsRouter.get('/', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const seasons = await db.query('SELECT * FROM seasons ORDER BY created_at DESC')
  res.json(seasons)
}))

// GET /api/seasons/prev-grades — 最近已结束赛季的绩效等级
seasonsRouter.get('/prev-grades', authMiddleware, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb()
  const lastEndedSeason = await db.queryOne<{ id: number }>(
    'SELECT id FROM seasons WHERE status = ? ORDER BY end_date DESC LIMIT 1',
    ['ended']
  )
  if (!lastEndedSeason) {
    res.json({})
    return
  }
  const rows = await db.query<{ user_key: string; performance_grade: string }>(
    'SELECT user_key, performance_grade FROM season_members WHERE season_id = ? AND performance_grade IS NOT NULL',
    [lastEndedSeason.id]
  )
  const gradeMap: Record<string, string> = {}
  for (const row of rows) {
    gradeMap[row.user_key] = row.performance_grade
  }
  res.json(gradeMap)
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
  await withTransaction(async tx => {
    await tx.execute("UPDATE seasons SET status = 'draft' WHERE status = 'active'")
    await tx.execute("UPDATE seasons SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id])
  })
  const season = await getDb().queryOne('SELECT * FROM seasons WHERE id = ?', [req.params.id])
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

// POST /api/seasons/:id/members/batch — 批量添加成员
seasonsRouter.post('/:id/members/batch', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { members } = req.body as { members: { user_key: string; performance_grade?: string; job_role?: string; sub_role?: string }[] }
  console.log('[batch] received members:', JSON.stringify(members))
  if (!Array.isArray(members) || members.length === 0) {
    res.status(400).json({ error: '缺少成员列表' })
    return
  }

  const seasonId = parseInt(req.params.id, 10)
  const db = getDb()
  const skipped: { user_key: string; name?: string; reason: string }[] = []
  let added = 0

  // 查出所有 user_key 对应的飞书用户信息
  const userKeys = members.map(m => m.user_key)
  const feishuPlaceholders = userKeys.map(() => '?').join(',')
  const feishuRows = await db.query<{ user_key: string; job_role: string | null; sub_role: string | null; name: string }>(
    `SELECT user_key, job_role, sub_role, name FROM feishu_user WHERE user_key IN (${feishuPlaceholders})`,
    userKeys
  )
  const feishuMap = new Map(feishuRows.map(r => [r.user_key, r]))
  console.log('[batch] feishuUsers found:', feishuRows.length, feishuRows.map(r => `${r.name}(${r.job_role})`))

  // 查出已有的赛季成员
  const existing = await db.query<{ user_key: string }>(
    `SELECT user_key FROM season_members WHERE season_id = ? AND user_key IN (${feishuPlaceholders})`,
    [seasonId, ...userKeys]
  )
  const existingSet = new Set(existing.map(r => r.user_key))

  // 自动查询上一赛季绩效等级
  const prevGrades = await lookupPrevGrades(db, userKeys)

  for (const m of members) {
    const feishu = feishuMap.get(m.user_key)

    if (existingSet.has(m.user_key)) {
      skipped.push({ user_key: m.user_key, name: feishu?.name, reason: '已在此赛季中' })
      continue
    }

    if (!feishu) {
      skipped.push({ user_key: m.user_key, reason: '飞书用户不存在' })
      continue
    }

    const jobRole = m.job_role || feishu.job_role || null
    const subRole = m.sub_role || feishu.sub_role || null
    const grade = m.performance_grade || prevGrades[m.user_key] || null
    const prevRawScore = grade ? getPerformanceScore(grade) : null

    if (!jobRole || !PARTICIPANT_JOB_ROLES.includes(jobRole as typeof PARTICIPANT_JOB_ROLES[number])) {
      skipped.push({ user_key: m.user_key, name: feishu.name, reason: '该岗位不参与赛季排名，请在人员目录维护岗位' })
      continue
    }

    try {
      await withTransaction(async tx => {
        if (m.job_role && m.job_role !== feishu.job_role) {
          await tx.execute('UPDATE feishu_user SET job_role = ? WHERE user_key = ?', [m.job_role, m.user_key])
        }
        if (m.sub_role && m.sub_role !== feishu.sub_role) {
          await tx.execute('UPDATE feishu_user SET sub_role = ? WHERE user_key = ?', [m.sub_role, m.user_key])
        }
        const result = await tx.execute(
          'INSERT INTO season_members (season_id, user_key, job_role, sub_role, performance_grade, prev_raw_score) VALUES (?, ?, ?, ?, ?, ?)',
          [seasonId, m.user_key, jobRole, jobRole === 'tech' ? subRole : null, grade, prevRawScore]
        )
        if (jobRole) {
          const dimensions = await tx.query<{ id: number; data_source?: string }>(
            'SELECT id, data_source FROM scoring_dimensions WHERE job_role = ?',
            [jobRole]
          )
          for (const dim of dimensions) {
            await tx.execute(
              'INSERT IGNORE INTO indicator_scores (season_member_id, dimension_id, source) VALUES (?, ?, ?)',
              [result.insertId, dim.id, dim.data_source || 'admin']
            )
          }
        }
      })
      added++
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate')) {
        skipped.push({ user_key: m.user_key, name: feishu.name, reason: '已在此赛季中' })
      } else {
        throw err
      }
    }
  }

  console.log('[batch] result:', { added, skipped: skipped.length, reasons: skipped })
  res.status(201).json({ added, skipped })
}))

// POST /api/seasons/:id/members/import-prev — 一键导入上赛季成员
seasonsRouter.post('/:id/members/import-prev', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const seasonId = parseInt(req.params.id, 10)
  const db = getDb()

  // 查找上一个已结束的赛季
  const prevSeason = await db.queryOne<{ id: number; name: string }>(
    `SELECT id, name FROM seasons WHERE status = 'ended' ORDER BY end_date DESC LIMIT 1`
  )
  if (!prevSeason) {
    res.status(400).json({ error: '没有已结束的赛季可导入' })
    return
  }

  // 查找上赛季成员（按 end_date 最近的取，可能同一赛季多人）
  const prevMembers = await db.query<{
    user_key: string; job_role: string | null; sub_role: string | null
    performance_grade: string | null; prev_raw_score: number | null
  }>(
    'SELECT user_key, job_role, sub_role, performance_grade, prev_raw_score FROM season_members WHERE season_id = ?',
    [prevSeason.id]
  )
  if (prevMembers.length === 0) {
    res.status(400).json({ error: `上赛季「${prevSeason.name}」没有成员` })
    return
  }

  // 当前赛季已有的成员
  const existing = await db.query<{ user_key: string }>(
    'SELECT user_key FROM season_members WHERE season_id = ?',
    [seasonId]
  )
  const existingSet = new Set(existing.map(r => r.user_key))

  let added = 0
  const skipped: { user_key: string; reason: string }[] = []

  for (const pm of prevMembers) {
    if (existingSet.has(pm.user_key)) {
      skipped.push({ user_key: pm.user_key, reason: '已在此赛季中' })
      continue
    }

    // 确认 user_key 在 feishu_user 中仍存在
    const feishu = await db.queryOne<{ user_key: string }>(
      'SELECT user_key FROM feishu_user WHERE user_key = ?',
      [pm.user_key]
    )
    if (!feishu) {
      skipped.push({ user_key: pm.user_key, reason: '飞书用户已不存在' })
      continue
    }
    if (!pm.job_role || !PARTICIPANT_JOB_ROLES.includes(pm.job_role as typeof PARTICIPANT_JOB_ROLES[number])) {
      skipped.push({ user_key: pm.user_key, reason: '该岗位不参与赛季排名，请在人员目录维护岗位' })
      continue
    }

    try {
      await withTransaction(async tx => {
        const result = await tx.execute(
          'INSERT INTO season_members (season_id, user_key, job_role, sub_role, performance_grade, prev_raw_score) VALUES (?, ?, ?, ?, ?, ?)',
          [seasonId, pm.user_key, pm.job_role, pm.job_role === 'tech' ? pm.sub_role : null, pm.performance_grade, pm.prev_raw_score]
        )
        if (pm.job_role) {
          const dimensions = await tx.query<{ id: number; data_source?: string }>(
            'SELECT id, data_source FROM scoring_dimensions WHERE job_role = ?',
            [pm.job_role]
          )
          for (const dim of dimensions) {
            await tx.execute(
              'INSERT IGNORE INTO indicator_scores (season_member_id, dimension_id, source) VALUES (?, ?, ?)',
              [result.insertId, dim.id, dim.data_source || 'admin']
            )
          }
        }
      })
      added++
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate')) {
        skipped.push({ user_key: pm.user_key, reason: '已在此赛季中' })
      } else {
        throw err
      }
    }
  }

  res.status(201).json({ added, skipped, prevSeasonName: prevSeason.name, prevSeasonMembers: prevMembers.length })
}))

// POST /api/seasons/:id/members — 添加成员
seasonsRouter.post('/:id/members', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { user_key, job_role, sub_role, performance_grade } = req.body
  if (!user_key) { res.status(400).json({ error: '缺少 user_key' }); return }
  if (!job_role || !PARTICIPANT_JOB_ROLES.includes(job_role)) {
    res.status(400).json({ error: '该岗位不参与赛季排名，请在人员目录维护岗位' })
    return
  }

  const seasonId = parseInt(req.params.id, 10)
  const db = getDb()
  const prevGrades = await lookupPrevGrades(db, [user_key])
  const grade = performance_grade || prevGrades[user_key] || null
  const prevRawScore = grade ? getPerformanceScore(grade) : null
  const effectiveSubRole = job_role === 'tech' ? (sub_role || null) : null

  try {
    const memberId = await withTransaction(async tx => {
      const result = await tx.execute(
        'INSERT INTO season_members (season_id, user_key, job_role, sub_role, performance_grade, prev_raw_score) VALUES (?, ?, ?, ?, ?, ?)',
        [seasonId, user_key, job_role, effectiveSubRole, grade, prevRawScore]
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
  const { job_role, sub_role, performance_grade } = req.body
  if (job_role !== undefined && job_role !== null && !PARTICIPANT_JOB_ROLES.includes(job_role)) {
    res.status(400).json({ error: '该岗位不参与赛季排名，请在人员目录维护岗位' })
    return
  }
  const db = getDb()
  const existing = await db.queryOne<{ user_key: string }>('SELECT user_key FROM season_members WHERE id = ? AND season_id = ?', [req.params.mid, req.params.id])
  const prevGrades = existing ? await lookupPrevGrades(db, [existing.user_key]) : {}
  const grade = performance_grade || prevGrades[existing?.user_key ?? ''] || undefined
  const prevRawScore = grade ? getPerformanceScore(grade) : undefined

  await db.execute(`
    UPDATE season_members SET
      job_role = COALESCE(?, job_role),
      sub_role = COALESCE(?, sub_role),
      performance_grade = COALESCE(?, performance_grade),
      prev_raw_score = COALESCE(?, prev_raw_score)
    WHERE id = ? AND season_id = ?
  `, [job_role, sub_role, performance_grade, prevRawScore, req.params.mid, req.params.id])

  const member = await db.queryOne('SELECT * FROM season_members WHERE id = ?', [req.params.mid])
  res.json(member)
}))

// DELETE /api/seasons/:id/members/:mid — 移除成员
seasonsRouter.delete('/:id/members/:mid', adminMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb()
  await db.execute('DELETE FROM season_members WHERE id = ? AND season_id = ?', [req.params.mid, req.params.id])
  res.json({ ok: true })
}))
