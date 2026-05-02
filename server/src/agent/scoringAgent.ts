import { BuiltInAgent, defineTool } from '@copilotkit/runtime/v2'
import { createOpenAI } from '@ai-sdk/openai'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { getIronSession } from 'iron-session'
import { z } from 'zod'
import { config } from '../config'
import { getDb } from '../db'
import { sessionOptions, type SessionData } from '../lib/session'

function loadScoringRules(): string {
  const rulesPath = resolve(process.cwd(), '../docs/scoring-rules.md')
  return readFileSync(rulesPath, 'utf-8')
}

const SCORING_RULES = loadScoringRules()

const SYSTEM_PROMPT = `你是“皇冠赛助手”，服务于皇冠赛系统中的普通用户和管理员。

你的目标不是假装什么都能做，而是在当前系统能力范围内，稳定地完成以下工作：

## 你该做的事
1. 解释皇冠赛规则、评分口径、岗位差异、组织分和举证流程
2. 结合当前页面和当前登录用户信息，解释用户现在在看什么、下一步应该去哪里操作
3. 帮用户判断一条举证描述更可能对应哪个岗位指标、是否像合格举证、还缺什么信息
4. 当用户想提交举证时，帮他把自然语言整理成更容易被管理员理解和采纳的描述
5. 对于“指标举证提交”场景，在信息齐全且用户明确确认后，代用户提交举证
6. 当用户的问题超出你当前能力时，明确说明限制，并引导到对应页面或人工处理

## 你不能做的事
1. 不能伪造实时数据、排名、待审核列表、分数、待办数量
2. 不能在没有工具或没有上下文数据时，声称“我已经查到”
3. 不能把“管理员录入”或“飞书同步”类指标，误说成“用户只靠举证就能直接确定”
4. 不能在信息不足时强行给出 raw_value、threshold_score 或最终分数
5. 不能替管理员做采纳、审批、最终定分这类决定

## 关于评分相关问题的处理方式
当用户在问“这条举证能不能算分”“更像哪个指标”“怎么写更容易被采纳”时：
1. 先识别岗位；如果没有明确岗位，再追问岗位（product / design / tech）
2. 判断该内容更接近哪个维度、哪个指标
3. 明确说明这是“候选匹配”还是“已经足够清晰”
4. 如果缺信息，只列出最关键的缺失项，不要泛泛追问
5. 只有当规则、阈值、原始值都明确可得时，才可以讨论分数计算；否则明确说“目前只能做规则匹配，不能可靠算分”

## 关于代提交举证的处理方式
1. 只支持“指标举证提交”，暂不代提交组织分举证
2. 当用户只是表达“想提交举证”或“帮我填一下”时，优先使用前端草稿能力，把内容写入表单并引导用户去提交页确认
3. 只有在用户已经看过内容、明确要求你直接提交，且图片已齐全时，才调用提交工具
4. 调用提交工具前，必须先向用户明确确认你将要提交的赛季、指标、数值、标题和描述
5. 如果用户还没有明确确认，不要调用提交工具
6. 如果缺少赛季、指标、数值、标题或描述中的关键字段，先补齐
7. 举证图片是必填项；如果用户还没有上传至少一张图片，不要调用提交工具，而是明确提示先去上传图片

## 关于页面和操作问题的处理方式
1. 可以根据“当前页面路由”“当前登录用户”“系统支持的核心业务能力”来解释页面用途和建议操作
2. 如果用户询问的是系统中应该去哪里完成某项操作，直接给出页面级指引
3. 如果用户询问实时业务数据，而你没有拿到该数据，就明确说明当前版本无法直接查询

## 回答风格
1. 优先用简洁中文回答
2. 先给结论，再给原因，再给下一步建议
3. 不要输出虚构的 JSON
4. 如果用户是在整理举证，可以使用结构化小标题，例如“建议匹配”“还缺信息”“建议改写”

## 评分规则
${SCORING_RULES}`

const matchScoringPointsTool = defineTool({
  name: 'match_scoring_points',
  description: '根据用户的岗位和举证描述，整理成可用于评分规则匹配的输入',
  parameters: z.object({
    job_role: z.enum(['product', 'design', 'tech']).describe('用户岗位'),
    description: z.string().describe('用户对举证内容的一句话描述'),
  }),
  execute: async (args) => {
    return { matched: true, job_role: args.job_role, description: args.description }
  },
})

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\-_/,.，。:：]/g, '')
}

async function getCurrentUserFromRequest(request: Request) {
  const session = await getIronSession<SessionData>(request, new Response(), sessionOptions)
  if (!session.user?.id) {
    return null
  }

  const db = getDb()
  return db.queryOne<Record<string, any>>('SELECT * FROM users WHERE id = ?', [session.user.id])
}

function createSubmitEvidenceTool(currentUser: Record<string, any> | null) {
  return defineTool({
    name: 'submit_evidence',
    description: '在用户明确确认后，代当前登录用户提交一条指标举证',
    parameters: z.object({
      confirmed: z.boolean().describe('只有在用户已经明确确认提交时才传 true'),
      season_id: z.number().int().optional().describe('目标赛季 ID；如果不传，则尝试自动选择当前唯一可用赛季'),
      metric_hint: z.string().describe('用户要提交的指标名称或简短提示，例如“微社区被点赞数”'),
      raw_value: z.number().nonnegative().describe('举证数值'),
      title: z.string().min(1).describe('举证标题'),
      description: z.string().min(1).describe('举证描述'),
      attachment_urls: z.array(z.string()).min(1).describe('已上传的举证图片 URL 列表，至少 1 张'),
    }),
    execute: async (args) => {
      if (!currentUser?.id || !currentUser.user_key) {
        return { ok: false, error: '请先登录后再提交举证。' }
      }
      if (!args.confirmed) {
        return { ok: false, error: '用户尚未明确确认提交。请先确认后再调用提交。' }
      }

      const db = getDb()
      const memberships = await db.query<{
        id: number
        season_id: number
        season_name: string
        job_role: 'product' | 'design' | 'tech' | null
        season_status: 'draft' | 'active' | 'ended'
      }>(`
        SELECT sm.id, sm.season_id, sm.job_role, s.name AS season_name, s.status AS season_status
        FROM season_members sm
        JOIN seasons s ON s.id = sm.season_id
        WHERE sm.user_key = ?
        ORDER BY s.status = 'active' DESC, s.created_at DESC, sm.id DESC
      `, [currentUser.user_key])

      if (!memberships.length) {
        return { ok: false, error: '你当前还没有加入任何赛季，不能提交举证。' }
      }

      const selectedMembership = args.season_id != null
        ? memberships.find(item => item.season_id === args.season_id)
        : memberships.filter(item => item.season_status === 'active').length === 1
          ? memberships.find(item => item.season_status === 'active')
          : undefined

      if (!selectedMembership) {
        return {
          ok: false,
          error: args.season_id != null
            ? '你不属于这个赛季，或该赛季不可用。'
            : '存在多个可选赛季，请先明确说明要提交到哪个赛季。',
          available_seasons: memberships.map(item => ({
            season_id: item.season_id,
            season_name: item.season_name,
            season_status: item.season_status,
          })),
        }
      }

      if (!selectedMembership.job_role) {
        return { ok: false, error: '当前赛季成员还没有配置岗位，暂时无法匹配指标。' }
      }

      const dimensions = await db.query<{
        id: number
        dimension_name: string
        indicator_name: string
      }>(`
        SELECT id, dimension_name, indicator_name
        FROM scoring_dimensions
        WHERE job_role = ? AND data_source = 'evidence'
        ORDER BY sort_order ASC, id ASC
      `, [selectedMembership.job_role])

      if (!dimensions.length) {
        return { ok: false, error: '当前岗位没有可提交的举证指标。' }
      }

      const metricHint = normalizeText(args.metric_hint)
      const matchedDimensions = dimensions.filter(item => {
        const indicator = normalizeText(item.indicator_name)
        const combined = normalizeText(`${item.dimension_name}${item.indicator_name}`)
        return indicator.includes(metricHint) || combined.includes(metricHint) || metricHint.includes(indicator)
      })

      if (matchedDimensions.length !== 1) {
        return {
          ok: false,
          error: matchedDimensions.length === 0
            ? '没有找到匹配的举证指标，请换一个更准确的指标名称。'
            : '匹配到了多个指标，请说得更具体一些。',
          candidate_metrics: (matchedDimensions.length ? matchedDimensions : dimensions).map(item => ({
            id: item.id,
            dimension_name: item.dimension_name,
            indicator_name: item.indicator_name,
          })),
        }
      }

      const target = matchedDimensions[0]
      const attachmentUrls = args.attachment_urls
      if (attachmentUrls.length === 0) {
        return { ok: false, error: '请至少上传一张举证图片后再提交。' }
      }
      const snapshot = {
        submitted_by: currentUser.id,
        season_member_id: selectedMembership.id,
        target_type: 'indicator',
        target_id: target.id,
        raw_value: args.raw_value,
        title: args.title,
        description: args.description,
        attachment_urls: attachmentUrls,
        created_at: new Date().toISOString(),
      }

      const result = await db.execute(`
        INSERT INTO evidence_submissions (season_member_id, target_type, target_id, title, description, attachment_urls, snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        selectedMembership.id,
        'indicator',
        target.id,
        args.title,
        args.description,
        JSON.stringify(attachmentUrls),
        JSON.stringify(snapshot),
      ])

      return {
        ok: true,
        evidence_id: result.insertId,
        season_id: selectedMembership.season_id,
        season_name: selectedMembership.season_name,
        target_id: target.id,
        dimension_name: target.dimension_name,
        indicator_name: target.indicator_name,
        title: args.title,
        raw_value: args.raw_value,
        attachment_count: attachmentUrls.length,
        status: 'pending',
      }
    },
  })
}

function parseJsonObject(value: string, envName: string): Record<string, any> | undefined {
  const text = value.trim()
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }
    return parsed as Record<string, any>
  } catch (error) {
    throw new Error(`${envName} must be a valid JSON object string`)
  }
}

function createModel() {
  const baseURL = config.copilotkit.openaiBaseUrl.trim()
  if (!baseURL) {
    return config.copilotkit.model
  }

  const apiKey = config.copilotkit.openaiApiKey.trim()
  if (!apiKey) {
    throw new Error(
      'Missing COPILOTKIT_OPENAI_API_KEY or OPENAI_API_KEY while COPILOTKIT_OPENAI_BASE_URL is set',
    )
  }

  const defaultHeaders = parseJsonObject(
    config.copilotkit.openaiDefaultHeaders,
    'COPILOTKIT_OPENAI_DEFAULT_HEADERS',
  )

  const provider = createOpenAI({
    baseURL,
    apiKey,
    name: 'openai',
    organization: config.copilotkit.openaiOrganization.trim() || undefined,
    project: config.copilotkit.openaiProject.trim() || undefined,
    headers: defaultHeaders,
  })

  console.log('[copilotkit] using OpenAI-compatible chat model config', {
    baseURL,
    model: config.copilotkit.openaiModel,
  })

  return provider.chat(config.copilotkit.openaiModel)
}

export async function createScoringAgent(request?: Request) {
  const currentUser = request ? (await getCurrentUserFromRequest(request)) ?? null : null

  const agent = new BuiltInAgent({
    model: createModel(),
    prompt: SYSTEM_PROMPT,
    tools: [
      matchScoringPointsTool,
      createSubmitEvidenceTool(currentUser),
    ],
  })
  agent.agentId = 'crown_competition_assistant'
  return agent
}
