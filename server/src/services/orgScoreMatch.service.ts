import OpenAI from 'openai'
import { getDb } from '../db'
import { config } from '../config'

export interface OrgScoreTypeRow {
  id: number
  name: string
  display_name: string
  points_per_unit: number
  max_per_season: number | null
}

export interface OrgScoreTypeMatchResult {
  best_match: {
    id: number
    name: string
    display_name: string
  } | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
  alternatives: Array<{
    id: number
    name: string
    display_name: string
  }>
  source: 'alias' | 'llm' | 'none'
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\-_/,.，。:：]/g, '')
}

function getTypeAliases(type: OrgScoreTypeRow): string[] {
  const aliases = [type.display_name, type.name]

  const aliasMap: Record<string, string[]> = {
    mentor: ['带教', '带教伙伴', '导师带教'],
    certified_trainer: ['认证讲师', '集团认证讲师', '讲师积分'],
    sharing_group: ['组内分享', '分享组内', '周会分享', '小组分享'],
    sharing_dept: ['会员数字化分享', '部门分享', '分享会员数字化'],
    sharing_group_hq: ['集团分享', '总部分享', '分享集团'],
    duty_no_response: ['值班未响应', '值班响应', '值班扣分'],
    gardener: ['花匠', '花匠工作'],
    referral_onboard: ['内推入职', '内推进人', '推荐入职'],
    referral_confirm: ['内推转正', '推荐转正'],
    value_a: ['价值观a', '价值观A'],
    infra_core: ['复杂基建核心', '基建核心', '核心基建'],
    infra_participate: ['复杂基建参与', '基建参与'],
    special_contribution: ['特别贡献', '组织评定', '特别贡献分'],
  }

  return [...aliases, ...(aliasMap[type.name] || [])]
}

function mapTypeSummary(type: OrgScoreTypeRow) {
  return {
    id: type.id,
    name: type.name,
    display_name: type.display_name,
  }
}

function getOpenAIClient() {
  const apiKey = (config.copilotkit.openaiApiKey || '').trim()
  if (!apiKey) return null

  const baseURL = config.copilotkit.openaiBaseUrl.trim() || undefined
  return new OpenAI({
    apiKey,
    baseURL,
    organization: config.copilotkit.openaiOrganization.trim() || undefined,
    project: config.copilotkit.openaiProject.trim() || undefined,
    defaultHeaders: (() => {
      const raw = config.copilotkit.openaiDefaultHeaders.trim()
      if (!raw) return undefined
      try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : undefined
      } catch {
        return undefined
      }
    })(),
  })
}

function aliasMatch(hint: string, types: OrgScoreTypeRow[]): OrgScoreTypeMatchResult | null {
  const normalizedHint = normalizeText(hint)
  if (!normalizedHint) return null

  const scored = types
    .map(type => {
      const aliases = getTypeAliases(type).map(normalizeText)
      const matchedAlias = aliases.find(alias => alias.includes(normalizedHint) || normalizedHint.includes(alias))
      return matchedAlias ? { type, matchedAlias, score: matchedAlias === normalizedHint ? 3 : 2 } : null
    })
    .filter((item): item is { type: OrgScoreTypeRow; matchedAlias: string; score: number } => item !== null)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  const best = scored[0]
  const alternatives = scored.slice(1, 3).map(item => mapTypeSummary(item.type))

  return {
    best_match: mapTypeSummary(best.type),
    confidence: best.score >= 3 && alternatives.length === 0 ? 'high' : 'medium',
    reason: `根据别名匹配命中“${best.type.display_name}”。`,
    alternatives,
    source: 'alias',
  }
}

async function llmMatch(hint: string, types: OrgScoreTypeRow[]): Promise<OrgScoreTypeMatchResult | null> {
  const client = getOpenAIClient()
  if (!client) return null

  const typeList = types.map(type => ({
    id: type.id,
    name: type.name,
    display_name: type.display_name,
    points_per_unit: type.points_per_unit,
    max_per_season: type.max_per_season,
  }))

  const response = await client.chat.completions.create({
    model: config.copilotkit.openaiModel,
    messages: [
      {
        role: 'system',
        content:
          '你是组织分类型映射助手。任务是根据用户的自然语言描述，从给定的组织分类型列表中选择最合适的一个类型，并给出置信度、理由和最多两个备选。只返回 JSON，不要输出额外文字。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          user_input: hint,
          org_score_types: typeList,
          output_schema: {
            best_match_id: 'number | null',
            confidence: 'high | medium | low',
            reason: 'string',
            alternative_ids: 'number[]',
          },
        }),
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  })

  const content = response.choices[0]?.message?.content
  if (!content) return null

  let parsed: {
    best_match_id?: number | null
    confidence?: 'high' | 'medium' | 'low'
    reason?: string
    alternative_ids?: number[]
  }

  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }

  const best = types.find(type => type.id === parsed.best_match_id) ?? null
  const alternatives = (parsed.alternative_ids || [])
    .map(id => types.find(type => type.id === id))
    .filter((item): item is OrgScoreTypeRow => Boolean(item))
    .filter(item => item.id !== best?.id)
    .slice(0, 2)
    .map(mapTypeSummary)

  return {
    best_match: best ? mapTypeSummary(best) : null,
    confidence: parsed.confidence || 'low',
    reason: parsed.reason || '模型未提供理由。',
    alternatives,
    source: best ? 'llm' : 'none',
  }
}

export async function listOrgScoreTypes() {
  const db = getDb()
  return db.query<OrgScoreTypeRow>('SELECT * FROM org_score_types ORDER BY sort_order')
}

export async function resolveOrgScoreTypeMatch(hint: string): Promise<OrgScoreTypeMatchResult> {
  const types = await listOrgScoreTypes()

  const aliasResult = aliasMatch(hint, types)
  if (aliasResult?.confidence === 'high') {
    return aliasResult
  }

  const llmResult = await llmMatch(hint, types)
  if (llmResult?.best_match) {
    return llmResult
  }

  if (aliasResult) {
    return aliasResult
  }

  return {
    best_match: null,
    confidence: 'low',
    reason: '未找到合适的组织分类型，请手动选择。',
    alternatives: [],
    source: 'none',
  }
}
