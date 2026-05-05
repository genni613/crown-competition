import { getDb } from '../db'
import admins from '../config/admins.json'
import type { User } from '../types/entities'

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

export async function updateUser(id: number, data: { role?: string; job_role?: string }): Promise<User> {
  const db = getDb()
  const sets: string[] = []
  const values: unknown[] = []

  if (data.role !== undefined) { sets.push('role = ?'); values.push(data.role) }
  if (data.job_role !== undefined) { sets.push('job_role = ?'); values.push(data.job_role) }

  if (sets.length > 0) {
    sets.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values)
  }

  return (await db.queryOne<User>('SELECT * FROM users WHERE id = ?', [id])) as User
}
