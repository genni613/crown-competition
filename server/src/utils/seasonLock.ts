import type { DbExecutor } from '../db'

export async function getSeasonStatus(db: DbExecutor, seasonId: number): Promise<'draft' | 'active' | 'ended' | undefined> {
  const season = await db.queryOne<{ status: 'draft' | 'active' | 'ended' }>(
    'SELECT status FROM seasons WHERE id = ?',
    [seasonId]
  )
  return season?.status
}

export async function assertSeasonEditable(db: DbExecutor, seasonId: number): Promise<void> {
  const status = await getSeasonStatus(db, seasonId)
  if (!status) {
    throw Object.assign(new Error('赛季不存在'), { status: 404 })
  }
  if (status === 'ended') {
    throw Object.assign(new Error('赛季已结束，请先重新激活后再修改'), { status: 400 })
  }
}
