export interface EvidenceDraft {
  seasonId?: number
  metricHint: string
  rawValue: number
  title: string
  description: string
  source: 'copilot'
  createdAt: string
}

const EVIDENCE_DRAFT_STORAGE_KEY = 'copilot:evidence-draft'

export function saveEvidenceDraft(draft: EvidenceDraft) {
  sessionStorage.setItem(EVIDENCE_DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function loadEvidenceDraft(): EvidenceDraft | null {
  const raw = sessionStorage.getItem(EVIDENCE_DRAFT_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<EvidenceDraft>
    if (
      typeof parsed.metricHint !== 'string' ||
      typeof parsed.rawValue !== 'number' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.description !== 'string'
    ) {
      return null
    }

    return {
      seasonId: typeof parsed.seasonId === 'number' ? parsed.seasonId : undefined,
      metricHint: parsed.metricHint,
      rawValue: parsed.rawValue,
      title: parsed.title,
      description: parsed.description,
      source: 'copilot',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function clearEvidenceDraft() {
  sessionStorage.removeItem(EVIDENCE_DRAFT_STORAGE_KEY)
}
