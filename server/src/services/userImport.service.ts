import { getDb } from '../db'
import { feishuProject } from './feishuProject.service'

interface SyncResult {
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ index: number; reason: string }>
}

function parseUser(user: any): Record<string, any> {
  const nameObj = user.name && typeof user.name === 'object' ? user.name : {}
  return {
    user_key: String(user.user_key ?? user.key ?? ''),
    user_id: Number(user.user_id ?? 0),
    username: String(user.username ?? ''),
    out_id: String(user.out_id ?? ''),
    name: String(nameObj.zh_cn ?? user.name_cn ?? ''),
    name_cn: String(user.name_cn ?? ''),
    name_en: String(user.name_en ?? ''),
    email: String(user.email ?? ''),
    avatar_url: String(user.avatar_url ?? ''),
    status: String(user.status ?? ''),
  }
}

async function upsertUser(db: any, row: Record<string, any>): Promise<'inserted' | 'updated'> {
  const result = await db.execute(`
    INSERT INTO feishu_user (
      user_key, user_id, username, out_id, name, name_cn, name_en, email, avatar_url, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      username = VALUES(username),
      out_id = VALUES(out_id),
      name = VALUES(name),
      name_cn = VALUES(name_cn),
      name_en = VALUES(name_en),
      email = VALUES(email),
      avatar_url = VALUES(avatar_url),
      status = VALUES(status)
  `, [
    row.user_key, row.user_id, row.username, row.out_id, row.name,
    row.name_cn, row.name_en, row.email, row.avatar_url, row.status,
  ])

  return result.affectedRows === 1 ? 'inserted' : 'updated'
}

/** 从已有工作项表中提取所有去重的 user_key */
async function collectUserKeys(): Promise<string[]> {
  const db = getDb()
  const keys = new Set<string>()

  const tables: Array<{ table: string; columns: string[] }> = [
    { table: 'feishu_workitem_gongshi', columns: ['work_hour_reporter'] },
    { table: 'feishu_workitem_story', columns: ['owner', 'current_status_operator'] },
    { table: 'feishu_workitem_project', columns: ['owner', 'current_status_operator'] },
  ]

  for (const { table, columns } of tables) {
    for (const col of columns) {
      try {
        const rows = await db.query<{ val: string }>(
          `SELECT DISTINCT \`${col}\` AS val FROM \`${table}\` WHERE \`${col}\` IS NOT NULL AND \`${col}\` != ''`
        )
        for (const row of rows) {
          const val = String(row.val).trim()
          if (val) keys.add(val)
        }
      } catch {
        // 表或列可能不存在，跳过
      }
    }
  }

  return Array.from(keys)
}

/** 全量同步用户 */
export async function syncAllUsers(): Promise<SyncResult> {
  feishuProject.assertConfigured()
  const db = getDb()

  const userKeys = await collectUserKeys()
  console.log('[user-import] collected user_keys from work items', { count: userKeys.length })

  if (userKeys.length === 0) {
    return { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] }
  }

  // 分批查询，每批 50
  const allUsers: any[] = []
  for (let i = 0; i < userKeys.length; i += 50) {
    const batch = userKeys.slice(i, i + 50)
    const json = await feishuProject.queryUsersByKeys(batch)
    const items = Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.data?.users) ? json.data.users
      : Array.isArray(json?.users) ? json.users
      : []
    allUsers.push(...items)
  }

  console.log('[user-import] fetched from /open_api/user/query', { total: allUsers.length })

  const errors: Array<{ index: number; reason: string }> = []
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (let i = 0; i < allUsers.length; i++) {
    try {
      const row = parseUser(allUsers[i])
      if (!row.user_key) {
        errors.push({ index: i, reason: '缺少 user_key' })
        skipped++
        continue
      }
      const action = await upsertUser(db, row)
      if (action === 'inserted') inserted++
      else updated++
    } catch (err) {
      errors.push({ index: i, reason: err instanceof Error ? err.message : String(err) })
      skipped++
    }
  }

  return { total: allUsers.length, inserted, updated, skipped, errors }
}
