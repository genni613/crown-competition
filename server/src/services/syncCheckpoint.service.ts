import { getDb } from '../db'

export interface ImportCheckpoint {
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  totalPages: number
  completedPages: number
  lastPageNum: number
  totalItems: number
  error?: string
}

export interface ScoringCheckpoint {
  completedMemberKeys: string[]
  failedMemberKeys: Array<{ key: string; reason: string }>
  totalMembers: number
}

export interface SyncWorkflowState {
  seasonId: number
  phase: 'idle' | 'importing' | 'resolving' | 'scoring' | 'done' | 'failed'
  imports: {
    workHours: ImportCheckpoint
    stories: ImportCheckpoint
    issues: ImportCheckpoint
    projects: ImportCheckpoint
  }
  scoring: ScoringCheckpoint
  rateLimitBudget: number
  startedAt: string
  updatedAt: string
}

export interface SyncReport {
  seasonId: number
  phase: SyncWorkflowState['phase']
  durationMs: number
  imports: Record<string, ImportCheckpoint>
  scoring: ScoringCheckpoint
  canResume: boolean
}

export function createInitialState(seasonId: number): SyncWorkflowState {
  const emptyImport: ImportCheckpoint = {
    status: 'pending',
    totalPages: 0,
    completedPages: 0,
    lastPageNum: 0,
    totalItems: 0,
  }
  return {
    seasonId,
    phase: 'idle',
    imports: {
      workHours: { ...emptyImport },
      stories: { ...emptyImport },
      issues: { ...emptyImport },
      projects: { ...emptyImport },
    },
    scoring: {
      completedMemberKeys: [],
      failedMemberKeys: [],
      totalMembers: 0,
    },
    rateLimitBudget: 100,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const CHECKPOINT_KEY_PREFIX = 'sync_checkpoint'

function checkpointKey(seasonId: number): string {
  return `${CHECKPOINT_KEY_PREFIX}:${seasonId}:full_sync`
}

export async function saveCheckpoint(seasonId: number, state: SyncWorkflowState): Promise<void> {
  const db = getDb()
  const key = checkpointKey(seasonId)
  state.updatedAt = new Date().toISOString()
  await db.execute(`
    INSERT INTO feishu_data_cache (season_id, user_id, metric_key, metric_value)
    VALUES (?, 'system', ?, ?)
    ON DUPLICATE KEY UPDATE metric_value = VALUES(metric_value)
  `, [seasonId, key, JSON.stringify(state)])
}

export async function loadCheckpoint(seasonId: number): Promise<SyncWorkflowState | null> {
  const db = getDb()
  const key = checkpointKey(seasonId)
  const row = await db.queryOne<{ metric_value: string }>(
    'SELECT metric_value FROM feishu_data_cache WHERE metric_key = ?',
    [key]
  )
  if (!row?.metric_value) return null
  try {
    return JSON.parse(row.metric_value) as SyncWorkflowState
  } catch {
    return null
  }
}

export async function clearCheckpoint(seasonId: number): Promise<void> {
  const db = getDb()
  const key = checkpointKey(seasonId)
  await db.execute('DELETE FROM feishu_data_cache WHERE metric_key = ?', [key])
}

export function generateSyncReport(state: SyncWorkflowState): SyncReport {
  return {
    seasonId: state.seasonId,
    phase: state.phase,
    durationMs: Date.now() - new Date(state.startedAt).getTime(),
    imports: { ...state.imports },
    scoring: { ...state.scoring },
    canResume:
      state.scoring.failedMemberKeys.length > 0
      || Object.values(state.imports).some(i => i.status === 'in_progress' || i.status === 'failed'),
  }
}
