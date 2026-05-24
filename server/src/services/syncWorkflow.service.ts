import {
  type SyncWorkflowState,
  type SyncReport,
  type ImportCheckpoint,
  createInitialState,
  saveCheckpoint,
  loadCheckpoint,
  generateSyncReport,
} from './syncCheckpoint.service'
import { feishuProject } from './feishuProject.service'
import { syncAllWorkHours } from './workHourImport.service'
import { syncAllStories } from './storyImport.service'
import { syncAllIssues } from './issueImport.service'
import { syncAllProjects } from './projectImport.service'
import { syncAllUsers } from './userImport.service'
import { syncSeasonFeishuData } from './feishuSync.service'

type ImportKey = keyof SyncWorkflowState['imports']
type SyncFn = () => Promise<{ total: number; inserted: number; updated: number; skipped: number; errors: Array<{ index: number; reason: string }> }>

const activeWorkflows = new Map<number, AbortController>()

export function isWorkflowRunning(seasonId: number): boolean {
  return activeWorkflows.has(seasonId)
}

export async function getWorkflowReport(seasonId: number): Promise<SyncReport | null> {
  const state = await loadCheckpoint(seasonId)
  if (!state) return null
  return generateSyncReport(state)
}

export function cancelWorkflow(seasonId: number): boolean {
  const controller = activeWorkflows.get(seasonId)
  if (!controller) return false
  controller.abort()
  feishuProject.cancelRateLimitWait()
  return true
}

export async function runSyncWorkflow(seasonId: number): Promise<SyncReport> {
  if (activeWorkflows.has(seasonId)) {
    throw new Error(`赛季 ${seasonId} 已有同步任务正在运行`)
  }

  const controller = new AbortController()
  activeWorkflows.set(seasonId, controller)
  feishuProject.resetRateLimitState()

  try {
    let state = await loadCheckpoint(seasonId)
    if (!state || state.phase === 'done') {
      state = createInitialState(seasonId)
    }

    // Step 1: Import layer (parallel, skip completed)
    if (!allImportsCompleted(state)) {
      state.phase = 'importing'
      await saveCheckpoint(seasonId, state)
      await runImportPhase(seasonId, state, controller.signal)
    }

    // Step 2: Resolve users
    if (state.phase === 'importing') {
      state.phase = 'resolving'
      await saveCheckpoint(seasonId, state)
      await feishuProject.waitForBudget()
      await syncAllUsers()
    }

    // Step 3: Scoring layer (reads local tables only, no rate limit concern)
    state.phase = 'scoring'
    await saveCheckpoint(seasonId, state)
    await runScoringPhase(seasonId, state)

    state.phase = 'done'
    await saveCheckpoint(seasonId, state)
    return generateSyncReport(state)
  } catch (error) {
    const state = await loadCheckpoint(seasonId)
    if (state) {
      state.phase = 'failed'
      await saveCheckpoint(seasonId, state)
    }
    throw error
  } finally {
    activeWorkflows.delete(seasonId)
    feishuProject.resetRateLimitState()
  }
}

function allImportsCompleted(state: SyncWorkflowState): boolean {
  return Object.values(state.imports).every(i => i.status === 'completed')
}

async function runImportPhase(seasonId: number, state: SyncWorkflowState, signal: AbortSignal): Promise<void> {
  const entries: Array<[ImportKey, SyncFn]> = [
    ['workHours', syncAllWorkHours],
    ['stories', syncAllStories],
    ['issues', syncAllIssues],
    ['projects', syncAllProjects],
  ]

  const tasks = entries
    .filter(([key]) => state.imports[key].status !== 'completed')
    .map(async ([key, syncFn]) => {
      if (signal.aborted) return
      const checkpoint = state.imports[key]
      checkpoint.status = 'in_progress'
      await saveCheckpoint(seasonId, state)

      try {
        await syncFn()
        checkpoint.status = 'completed'
      } catch (error) {
        checkpoint.status = 'failed'
        checkpoint.error = error instanceof Error ? error.message : String(error)
      }
      await saveCheckpoint(seasonId, state)
    })

  await Promise.allSettled(tasks)
}

async function runScoringPhase(seasonId: number, state: SyncWorkflowState): Promise<void> {
  const result = await syncSeasonFeishuData(seasonId)
  state.scoring.totalMembers = result.memberCount
  state.scoring.failedMemberKeys = result.warnings.map(w => ({
    key: w.userId || 'unknown',
    reason: w.reason,
  }))
}
