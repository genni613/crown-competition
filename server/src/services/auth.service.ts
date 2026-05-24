import { getDb } from '../db'
import admins from '../config/admins.json'
import type { User } from '../types/entities'

export interface MemberDirectoryFilters {
  seasonId?: number
  jobRole?: 'product' | 'design' | 'tech' | 'test'
  department?: string
  keyword?: string
  anomalyOnly?: boolean
}

export interface MemberDirectoryItem {
  user_id: number | null
  user_key: string | null
  open_id: string | null
  name: string
  avatar_url: string | null
  email: string | null
  department_name: string | null
  title: string | null
  role: 'ADMIN' | 'MEMBER' | null
  job_role: 'product' | 'design' | 'tech' | 'test' | null
  sub_role: 'client' | 'frontend' | 'backend' | null
  system_job_role: 'product' | 'design' | 'tech' | 'test' | null
  system_sub_role: 'client' | 'frontend' | 'backend' | null
  selected_season_id: number | null
  selected_season_name: string | null
  selected_season_status: 'draft' | 'active' | 'ended' | null
  selected_season_member_id: number | null
  selected_total_score: number | null
  selected_final_position_score: number | null
  selected_total_org_score: number | null
  selected_rank: number | null
  selected_distribution: '2' | '7' | '1' | null
  latest_ended_total_score: number | null
  season_count: number
  last_sync_at: string | null
  anomalies: string[]
}

export interface MemberSeasonHistoryItem {
  season_id: number
  season_name: string
  season_status: 'draft' | 'active' | 'ended'
  start_date: string
  end_date: string
  season_member_id: number
  job_role: 'product' | 'design' | 'tech' | null
  sub_role: 'client' | 'frontend' | 'backend' | null
  performance_grade: string | null
  final_position_score: number | null
  total_org_score: number
  total_score: number | null
  rank: number | null
  distribution: '2' | '7' | '1' | null
}

export async function upsertUser(params: {
  open_id: string
  name: string
  avatar_url?: string | null
  email?: string | null
  department_id?: string | null
  department_name?: string | null
  title?: string | null
  role: string
}): Promise<User> {
  const db = getDb()
  const existing = await db.queryOne<User>('SELECT * FROM users WHERE open_id = ?', [params.open_id])

  // 通过姓名从 feishu_user 匹配 user_key
  // 注：open_id 和 user_key 来自飞书两套 API，无法自动关联，只能靠姓名匹配
  const feishuRow = await db.queryOne<{ user_key: string }>(
    'SELECT user_key FROM feishu_user WHERE name = ? LIMIT 1',
    [params.name]
  )
  const userKey = feishuRow?.user_key ?? null

  if (existing) {
    const updateRole = admins.admins.includes(params.open_id) ? 'ADMIN' : existing.role
    await db.execute(`
      UPDATE users SET name = ?, avatar_url = ?, email = ?, department_id = ?,
        department_name = ?, title = ?, role = ?, user_key = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      params.name, params.avatar_url, params.email, params.department_id,
      params.department_name, params.title, updateRole, userKey, existing.id
    ])
    return (await db.queryOne<User>('SELECT * FROM users WHERE id = ?', [existing.id])) as User
  } else {
    const role = admins.admins.includes(params.open_id) ? 'ADMIN' : 'MEMBER'
    await db.execute(`
      INSERT INTO users (open_id, user_key, name, avatar_url, email, department_id, department_name, title, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      params.open_id, userKey, params.name, params.avatar_url, params.email,
      params.department_id, params.department_name, params.title, role
    ])
    const result = await db.queryOne<User>('SELECT * FROM users WHERE open_id = ?', [params.open_id])
    return result as User
  }
}

export async function getAllUsers(): Promise<User[]> {
  const db = getDb()
  return db.query<User>('SELECT * FROM users ORDER BY created_at DESC')
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = getDb()
  return db.queryOne<User>('SELECT * FROM users WHERE id = ?', [id])
}

export async function updateUser(id: number, data: { role?: string; job_role?: string; sub_role?: string | null }): Promise<User> {
  const db = getDb()
  const sets: string[] = []
  const values: unknown[] = []

  if (data.role !== undefined) { sets.push('role = ?'); values.push(data.role) }
  if (data.job_role !== undefined) { sets.push('job_role = ?'); values.push(data.job_role) }
  if (data.sub_role !== undefined) { sets.push('sub_role = ?'); values.push(data.sub_role) }

  if (sets.length > 0) {
    sets.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values)
  }

  return (await db.queryOne<User>('SELECT * FROM users WHERE id = ?', [id])) as User
}

export async function getMemberDirectory(filters: MemberDirectoryFilters = {}): Promise<MemberDirectoryItem[]> {
  const db = getDb()
  const selectedSeasonId = filters.seasonId ?? await resolveSelectedSeasonId()

  const whereParts: string[] = []
  const params: unknown[] = []

  if (filters.jobRole) {
    whereParts.push('COALESCE(fu.job_role, u.job_role) = ?')
    params.push(filters.jobRole)
  }

  if (filters.department) {
    whereParts.push('COALESCE(u.department_name, \'\') = ?')
    params.push(filters.department)
  }

  if (filters.keyword) {
    whereParts.push('(COALESCE(fu.name, u.name, dbase.name) LIKE ? OR COALESCE(NULLIF(fu.email, \'\'), u.email, dbase.email, \'\') LIKE ?)')
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`)
  }

  const selectedSeasonJoin = selectedSeasonId
    ? `
      LEFT JOIN season_members sm_selected
        ON sm_selected.user_key COLLATE utf8mb4_unicode_ci = dbase.user_key COLLATE utf8mb4_unicode_ci AND sm_selected.season_id = ${Number(selectedSeasonId)}
      LEFT JOIN seasons s_selected
        ON s_selected.id = sm_selected.season_id
    `
    : `
      LEFT JOIN season_members sm_selected
        ON 1 = 0
      LEFT JOIN seasons s_selected
        ON 1 = 0
    `

  const rows = await db.query<Omit<MemberDirectoryItem, 'anomalies'>>(
    `
      SELECT
        u.id AS user_id,
        dbase.user_key,
        u.open_id,
        COALESCE(fu.name, u.name, dbase.name) AS name,
        COALESCE(fu.avatar_url, u.avatar_url, dbase.avatar_url) AS avatar_url,
        COALESCE(NULLIF(fu.email, ''), u.email, dbase.email) AS email,
        u.department_name,
        u.title,
        u.role,
        fu.job_role,
        fu.sub_role,
        u.job_role AS system_job_role,
        u.sub_role AS system_sub_role,
        s_selected.id AS selected_season_id,
        s_selected.name AS selected_season_name,
        s_selected.status AS selected_season_status,
        sm_selected.id AS selected_season_member_id,
        sm_selected.total_score AS selected_total_score,
        sm_selected.final_position_score AS selected_final_position_score,
        sm_selected.total_org_score AS selected_total_org_score,
        sm_selected.rank AS selected_rank,
        sm_selected.distribution AS selected_distribution,
        latest_ended.total_score AS latest_ended_total_score,
        COALESCE(member_stats.season_count, 0) AS season_count,
        fu.updated_at AS last_sync_at
      FROM (
        SELECT
          fu.user_key COLLATE utf8mb4_unicode_ci AS user_key,
          fu.name COLLATE utf8mb4_unicode_ci AS name,
          fu.avatar_url,
          fu.email COLLATE utf8mb4_unicode_ci AS email
        FROM feishu_user fu

        UNION

        SELECT
          NULL AS user_key,
          u.name COLLATE utf8mb4_unicode_ci AS name,
          u.avatar_url,
          u.email COLLATE utf8mb4_unicode_ci AS email
        FROM users u
        WHERE u.user_key IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM feishu_user mapped
             WHERE mapped.user_key = u.user_key COLLATE utf8mb4_unicode_ci
           )
      ) dbase
      LEFT JOIN feishu_user fu
        ON fu.user_key = dbase.user_key COLLATE utf8mb4_unicode_ci
      LEFT JOIN users u
        ON (dbase.user_key IS NOT NULL AND u.user_key = dbase.user_key COLLATE utf8mb4_unicode_ci)
        OR (
          dbase.user_key IS NULL
          AND u.user_key IS NULL
          AND u.name = dbase.name
          AND COALESCE(u.email, '') = COALESCE(dbase.email, '')
        )
      ${selectedSeasonJoin}
      LEFT JOIN (
        SELECT user_key, COUNT(*) AS season_count
        FROM season_members
        GROUP BY user_key
      ) member_stats
        ON member_stats.user_key COLLATE utf8mb4_unicode_ci = dbase.user_key COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT ended.user_key, ended.total_score
        FROM season_members ended
        JOIN seasons ended_season
          ON ended_season.id = ended.season_id
        JOIN (
          SELECT sm.user_key, MAX(s.end_date) AS latest_end_date
          FROM season_members sm
          JOIN seasons s
            ON s.id = sm.season_id
          WHERE s.status = 'ended'
          GROUP BY sm.user_key
        ) latest
          ON latest.user_key COLLATE utf8mb4_unicode_ci = ended.user_key COLLATE utf8mb4_unicode_ci
         AND ended_season.end_date = latest.latest_end_date
      ) latest_ended
        ON latest_ended.user_key COLLATE utf8mb4_unicode_ci = dbase.user_key COLLATE utf8mb4_unicode_ci
      ${whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''}
      ORDER BY
        sm_selected.total_score IS NULL,
        sm_selected.total_score DESC,
        COALESCE(fu.name, u.name, dbase.name) ASC
    `,
    params
  )

  return rows
    .map(row => ({
      ...row,
      anomalies: computeMemberAnomalies(row),
    }))
    .filter(row => !filters.anomalyOnly || row.anomalies.length > 0)
}

export async function getMemberSeasonHistory(userKey: string): Promise<MemberSeasonHistoryItem[]> {
  const db = getDb()
  if (!userKey) {
    return []
  }

  return db.query<MemberSeasonHistoryItem>(
    `
      SELECT
        s.id AS season_id,
        s.name AS season_name,
        s.status AS season_status,
        s.start_date,
        s.end_date,
        sm.id AS season_member_id,
        sm.job_role,
        sm.sub_role,
        sm.performance_grade,
        sm.final_position_score,
        sm.total_org_score,
        sm.total_score,
        sm.rank,
        sm.distribution
      FROM season_members sm
      JOIN seasons s
        ON s.id = sm.season_id
      WHERE sm.user_key = ?
      ORDER BY s.start_date DESC, sm.id DESC
    `,
    [userKey]
  )
}

export async function updateMemberDirectoryJobRole(
  userKey: string,
  data: {
    job_role?: 'product' | 'design' | 'tech' | 'test' | null
    sub_role?: 'client' | 'frontend' | 'backend' | null
    syncDraftSeasonMembers?: boolean
  }
): Promise<{ user_key: string; job_role: string | null; sub_role: string | null }> {
  const db = getDb()
  const feishuUser = await db.queryOne<{ user_key: string }>('SELECT user_key FROM feishu_user WHERE user_key = ?', [userKey])
  if (!feishuUser) {
    throw new Error('成员不存在')
  }

  const jobRole = data.job_role ?? null
  const subRole = jobRole === 'tech' ? (data.sub_role ?? null) : null

  await db.execute(
    'UPDATE feishu_user SET job_role = ?, sub_role = ? WHERE user_key = ?',
    [jobRole, subRole, userKey]
  )
  await db.execute(
    'UPDATE users SET job_role = ?, sub_role = ?, updated_at = CURRENT_TIMESTAMP WHERE user_key = ?',
    [jobRole, subRole, userKey]
  )

  if (data.syncDraftSeasonMembers && jobRole !== 'test') {
    await db.execute(
      `
        UPDATE season_members sm
        JOIN seasons s ON s.id = sm.season_id
        SET sm.job_role = ?, sm.sub_role = ?
        WHERE sm.user_key = ? AND s.status = 'draft'
      `,
      [jobRole, subRole, userKey]
    )
  }

  return {
    user_key: userKey,
    job_role: jobRole,
    sub_role: subRole,
  }
}

async function resolveSelectedSeasonId(): Promise<number | undefined> {
  const db = getDb()
  const activeSeason = await db.queryOne<{ id: number }>(
    'SELECT id FROM seasons WHERE status = ? ORDER BY start_date DESC LIMIT 1',
    ['active']
  )
  if (activeSeason?.id) return activeSeason.id

  const latestSeason = await db.queryOne<{ id: number }>(
    'SELECT id FROM seasons ORDER BY end_date DESC, start_date DESC LIMIT 1'
  )
  return latestSeason?.id
}

function computeMemberAnomalies(
  row: Omit<MemberDirectoryItem, 'anomalies'>
): string[] {
  const anomalies: string[] = []

  if (!row.user_key) {
    anomalies.push('缺少 user_key')
  }
  if (!row.job_role) {
    anomalies.push('未配置岗位')
  }
  if (row.selected_season_id && !row.selected_season_member_id && row.job_role !== 'test') {
    anomalies.push('当前赛季未参赛')
  }
  if (row.selected_season_member_id && row.selected_total_score == null) {
    anomalies.push('当前赛季无总分')
  }
  if (
    row.system_job_role &&
    row.job_role &&
    (row.system_job_role !== row.job_role || (row.system_sub_role || null) !== (row.sub_role || null))
  ) {
    anomalies.push('岗位数据不一致')
  }

  return anomalies
}
