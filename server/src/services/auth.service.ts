import { getDb } from '../db'
import admins from '../config/admins.json'
import type { User } from '../types/entities'

export function upsertUser(params: {
  id: string
  name: string
  avatar_url?: string | null
  email?: string | null
  department_id?: string | null
  department_name?: string | null
  title?: string | null
  role: string
}): User {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id) as User | undefined

  if (existing) {
    // 老用户：更新信息，但保留数据库中的角色（除非是配置中的管理员）
    const updateRole = admins.admins.includes(params.id) ? 'ADMIN' : existing.role
    db.prepare(`
      UPDATE users SET name = ?, avatar_url = ?, email = ?, department_id = ?,
        department_name = ?, title = ?, role = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      params.name, params.avatar_url, params.email, params.department_id,
      params.department_name, params.title, updateRole, params.id
    )
    return db.prepare('SELECT * FROM users WHERE id = ?').get(params.id) as User
  } else {
    // 新用户：根据配置分配角色
    const role = admins.admins.includes(params.id) ? 'ADMIN' : 'MEMBER'
    db.prepare(`
      INSERT INTO users (id, name, avatar_url, email, department_id, department_name, title, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.id, params.name, params.avatar_url, params.email,
      params.department_id, params.department_name, params.title, role
    )
    return db.prepare('SELECT * FROM users WHERE id = ?').get(params.id) as User
  }
}

export function getAllUsers(): User[] {
  const db = getDb()
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[]
}

export function getUserById(id: string): User | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
}

export function updateUser(id: string, data: { role?: string; job_role?: string }): User {
  const db = getDb()
  const sets: string[] = []
  const values: any[] = []

  if (data.role !== undefined) { sets.push('role = ?'); values.push(data.role) }
  if (data.job_role !== undefined) { sets.push('job_role = ?'); values.push(data.job_role) }

  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')")
    values.push(id)
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User
}
