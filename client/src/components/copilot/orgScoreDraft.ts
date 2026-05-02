export interface OrgScoreDraft {
  seasonId: number
  memberName: string
  scoreTypeHint: string
  matchedTypeId?: number
  matchedTypeName?: string
  matchConfidence?: 'high' | 'medium' | 'low'
  matchReason?: string
  alternatives?: Array<{ id: number; name: string; display_name: string }>
  matchSource?: 'alias' | 'llm' | 'none'
  quantity: number
  description: string
  source: 'copilot'
  createdAt: string
}

const ORG_SCORE_DRAFT_STORAGE_KEY = 'copilot:org-score-draft'

export function saveOrgScoreDraft(draft: OrgScoreDraft) {
  sessionStorage.setItem(ORG_SCORE_DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function loadOrgScoreDraft(): OrgScoreDraft | null {
  const raw = sessionStorage.getItem(ORG_SCORE_DRAFT_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<OrgScoreDraft>
    if (
      typeof parsed.seasonId !== 'number' ||
      typeof parsed.memberName !== 'string' ||
      typeof parsed.scoreTypeHint !== 'string' ||
      typeof parsed.quantity !== 'number' ||
      typeof parsed.description !== 'string'
    ) {
      return null
    }

    return {
      seasonId: parsed.seasonId,
      memberName: parsed.memberName,
      scoreTypeHint: parsed.scoreTypeHint,
      matchedTypeId: typeof parsed.matchedTypeId === 'number' ? parsed.matchedTypeId : undefined,
      matchedTypeName: typeof parsed.matchedTypeName === 'string' ? parsed.matchedTypeName : undefined,
      matchConfidence: ['high', 'medium', 'low'].includes(String(parsed.matchConfidence)) ? parsed.matchConfidence as 'high' | 'medium' | 'low' : undefined,
      matchReason: typeof parsed.matchReason === 'string' ? parsed.matchReason : undefined,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.filter((item): item is { id: number; name: string; display_name: string } => Boolean(item && typeof item.id === 'number' && typeof item.name === 'string' && typeof item.display_name === 'string')) : undefined,
      matchSource: ['alias', 'llm', 'none'].includes(String(parsed.matchSource)) ? parsed.matchSource as 'alias' | 'llm' | 'none' : undefined,
      quantity: parsed.quantity,
      description: parsed.description,
      source: 'copilot',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function clearOrgScoreDraft() {
  sessionStorage.removeItem(ORG_SCORE_DRAFT_STORAGE_KEY)
}
