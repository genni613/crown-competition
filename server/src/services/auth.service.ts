import { getDb } from '../db'
import admins from '../config/admins.json'
import type { User } from '../types/entities'

export async function upsertUser(params: {
  id: string
  name: string
  avatar_url?: string | null
  email?: string | null
  department_id?: string | null
  department_name?: string | null
  title?: string | null
  role: string
}): Promise<User> {
  const db = getDb()
  const existing = await db.queryOne<User>('SELECT * FROM users WHERE id = ?', [params.id])

  if (existing) {
    // 老用户：更新信息，但保留数据库中的角色（除非是配置中的管理员）
    const updateRole = admins.admins.includes(params.id) ? 'ADMIN' : existing.role
    await db.execute(`
      UPDATE users SET name = ?, avatar_url = ?, email = ?, department_id = ?,
        department_name = ?, title = ?, role = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      params.name, params.avatar_url, params.email, params.department_id,
      params.department_name, params.title, updateRole, params.id
    ])
    return (await db.queryOne<User>('SELECT * FROM users WHERE id = ?', [params.id])) as User
  } else {
    // 新用户：根据配置分配角色
    const role = admins.admins.includes(params.id) ? 'ADMIN' : 'MEMBER'
    await db.execute(`
      INSERT INTO users (id, name, avatar_url, email, department_id, department_name, title, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      params.id, params.name, params.avatar_url, params.email,
      params.department_id, params.department_name, params.title, role
    ])
    return (await db.queryOne<User>('SELECT * FROM users WHERE id = ?', [params.id])) as User
  }
}

export async function getAllUsers(): Promise<User[]> {
  const db = getDb()
  return db.query<User>('SELECT * FROM users ORDER BY created_at DESC')
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = getDb()
  return db.queryOne<User>('SELECT * FROM users WHERE id = ?', [id])
}

export async function updateUser(id: string, data: { role?: string; job_role?: string }): Promise<User> {
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
