import { BuiltInAgent, defineTool } from '@copilotkit/runtime/v2'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { z } from 'zod'

function loadScoringRules(): string {
  const rulesPath = resolve(process.cwd(), '../docs/scoring-rules.md')
  return readFileSync(rulesPath, 'utf-8')
}

const SCORING_RULES = loadScoringRules()

const SYSTEM_PROMPT = `你是"皇冠赛"评分助手。你的核心能力是根据用户描述的举证内容，匹配评分规则中的得分点。

## 你能做的事
1. 根据用户的岗位和描述，匹配到对应的评分维度和指标
2. 计算出建议的 raw_value 和 threshold_score
3. 给出匹配理由和解释
4. 如果描述内容不明确，主动追问

## 评分规则
${SCORING_RULES}

## 阈值评分计算方法
- value >= threshold_100 → 100 分
- value >= threshold_60 → 60 + (value - threshold_60) / (threshold_100 - threshold_60) * 40
- value < threshold_60 → 0 分

## 注意事项
- 如果用户没有说明岗位，先追问岗位（产品 product / 设计 design / 研发 tech）
- 如果描述不清晰，先追问细节
- 匹配到得分点时，用结构化 JSON 格式输出`

const matchScoringPointsTool = defineTool({
  name: 'match_scoring_points',
  description: '根据用户描述的举证内容和岗位，匹配评分规则中的得分点，计算建议分数',
  parameters: z.object({
    job_role: z.enum(['product', 'design', 'tech']).describe('用户岗位'),
    description: z.string().describe('用户对举证内容的一句话描述'),
  }),
  execute: async (args) => {
    return { matched: true, job_role: args.job_role, description: args.description }
  },
})

export const scoringAgent = new BuiltInAgent({
  model: 'openai/gpt-4o',
  prompt: SYSTEM_PROMPT,
  tools: [matchScoringPointsTool],
})
scoringAgent.agentId = 'crown_competition_assistant'
