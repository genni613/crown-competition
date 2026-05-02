import { useLocation, useNavigate } from 'react-router-dom'
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core'
import { Card, Typography } from 'antd'
import { CopilotPopup } from '@copilotkit/react-core/v2'
import { matchOrgScoreType } from '../../api/orgScores'
import { getSeasons } from '../../api/seasons'
import type { Season } from '../../types/models'
import { useAuthStore } from '../../store/authStore'
import { copilotConfig } from './config'
import { saveEvidenceDraft } from './evidenceDraft'
import { saveOrgScoreDraft } from './orgScoreDraft'

const supportedFeatures = [
  '解释皇冠赛规则、岗位差异、评分维度和举证口径',
  '根据当前页面，告诉用户下一步应该去哪里操作',
  '帮助用户整理举证描述，判断更可能对应哪个评分指标',
  '根据自然语言生成举证草稿，并跳转或刷新举证页自动填表',
  '为管理员生成组织分录入草稿，并跳转或刷新组织分页自动带出成员和分项',
  '在信息齐全且用户确认后，代提交指标举证',
  '指导用户如何提交更清晰、更容易被采纳的举证材料',
  '当问题超出当前能力范围时，明确说明限制并引导到对应页面或人工处理',
]

function buildDraftNavigationTarget(path: string) {
  return `${path}?draftTs=${Date.now()}`
}

export function AppCopilotPopup() {
  if (!copilotConfig.enabled) {
    return null
  }

  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  useCopilotReadable(
    {
      description: '当前登录用户',
      value: user
        ? {
            id: user.id,
            name: user.name,
            role: user.role,
            email: user.email,
          }
        : null,
    },
    [user],
  )

  useCopilotReadable(
    {
      description: '当前页面路由',
      value: location.pathname,
    },
    [location.pathname],
  )

  useCopilotReadable(
    {
      description: '当前系统支持的核心业务能力',
      value: supportedFeatures,
    },
    [],
  )

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'draft_evidence_form',
      description: '根据用户的自然语言整理一条指标举证草稿，并跳转到举证提交页自动填好表单，供用户确认后再提交',
      parameters: [
        { name: 'metricHint', type: 'string', required: true, description: '指标名称或简短提示，例如“微社区被点赞数”' },
        { name: 'rawValue', type: 'number', required: true, description: '举证数值' },
        { name: 'title', type: 'string', required: true, description: '建议填写到表单里的举证标题' },
        { name: 'description', type: 'string', required: true, description: '建议填写到表单里的举证描述' },
        { name: 'seasonId', type: 'number', required: false, description: '目标赛季 ID，不传则由页面优先选择进行中的赛季' },
      ],
      handler: async ({
        metricHint,
        rawValue,
        title,
        description,
        seasonId,
      }: {
        metricHint: string
        rawValue: number
        title: string
        description: string
        seasonId?: number
      }) => {
        saveEvidenceDraft({
          seasonId,
          metricHint,
          rawValue,
          title,
          description,
          source: 'copilot',
          createdAt: new Date().toISOString(),
        })

        const targetPath = buildDraftNavigationTarget('/evidence/submit')
        navigate(targetPath)

        return {
          ok: true,
          navigatedTo: targetPath,
          draft: {
            seasonId: seasonId ?? null,
            metricHint,
            rawValue,
            title,
            description,
          },
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') {
          return <Typography.Text type="secondary">正在生成举证草稿并打开提交页面...</Typography.Text>
        }
        if (!result) return null
        if (result.error) {
          return <Typography.Text type="danger">{result.error}</Typography.Text>
        }
        return (
          <Card size="small" style={{ maxWidth: 460 }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              已为你生成举证草稿
            </Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 6 }}>
              已跳转或刷新举证提交页，并自动填入指标、数值、标题和描述。
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              你还需要确认内容，并补充至少一张举证图片后再提交。
            </Typography.Text>
          </Card>
        )
      },
    } : null as any,
  )

  useCopilotAction(
    copilotConfig.enabled ? {
      name: 'draft_org_score_form',
      description: '为管理员生成一条组织分录入草稿，并跳转到对应赛季的组织分页面自动填好成员、类型、数量和说明',
      parameters: [
        { name: 'memberName', type: 'string', required: true, description: '成员姓名，例如“张三”' },
        { name: 'scoreTypeHint', type: 'string', required: true, description: '组织分类型名称或简短提示，例如“组内分享”' },
        { name: 'quantity', type: 'number', required: true, description: '数量，通常为 1' },
        { name: 'description', type: 'string', required: true, description: '建议填写到表单里的说明' },
        { name: 'seasonId', type: 'number', required: false, description: '目标赛季 ID，不传则优先选择进行中的赛季' },
      ],
      handler: async ({
        memberName,
        scoreTypeHint,
        quantity,
        description,
        seasonId,
      }: {
        memberName: string
        scoreTypeHint: string
        quantity: number
        description: string
        seasonId?: number
      }) => {
        if (user?.role !== 'ADMIN') {
          return { error: '只有管理员可以使用组织分录入草稿。' }
        }

        const seasonsRes = await getSeasons()
        const seasons: Season[] = seasonsRes.data
        const targetSeason = seasonId != null
          ? seasons.find(item => item.id === seasonId)
          : seasons.find(item => item.status === 'active') ?? seasons[0]

        if (!targetSeason) {
          return { error: '当前没有可用赛季，无法生成组织分草稿。' }
        }

        const matchRes = await matchOrgScoreType(scoreTypeHint)
        const match = matchRes.data

        saveOrgScoreDraft({
          seasonId: targetSeason.id,
          memberName,
          scoreTypeHint,
          matchedTypeId: match.best_match?.id,
          matchedTypeName: match.best_match?.display_name,
          matchConfidence: match.confidence,
          matchReason: match.reason,
          alternatives: match.alternatives,
          matchSource: match.source,
          quantity,
          description,
          source: 'copilot',
          createdAt: new Date().toISOString(),
        })

        const targetPath = buildDraftNavigationTarget(`/admin/org-scores/${targetSeason.id}`)
        navigate(targetPath)

        return {
          ok: true,
          navigatedTo: targetPath,
          seasonName: targetSeason.name,
          draft: {
            memberName,
            scoreTypeHint,
            matchedTypeName: match.best_match?.display_name ?? null,
            matchConfidence: match.confidence,
            quantity,
            description,
          },
        }
      },
      render: ({ status, result }: { status: string; result: any }) => {
        if (status === 'executing') {
          return <Typography.Text type="secondary">正在生成组织分草稿并打开录入页面...</Typography.Text>
        }
        if (!result) return null
        if (result.error) {
          return <Typography.Text type="danger">{result.error}</Typography.Text>
        }
        return (
          <Card size="small" style={{ maxWidth: 460 }}>
            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              已为你生成组织分草稿
            </Typography.Text>
            <Typography.Paragraph style={{ marginBottom: 6 }}>
              已跳转或刷新组织分录入页，并尝试自动带出成员、分项、数量和说明。
            </Typography.Paragraph>
            <Typography.Text style={{ display: 'block', marginBottom: 4 }}>
              建议分项：{result.draft.matchedTypeName || '未确定'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              请核对成员和分项是否匹配，再确认提交。
            </Typography.Text>
          </Card>
        )
      },
    } : null as any,
  )

  return (
    <CopilotPopup
      agentId={copilotConfig.agent}
      clickOutsideToClose
      labels={{
        modalHeaderTitle: '皇冠赛助手',
        welcomeMessageText: '嗨，有什么可以帮你的？比如查规则、整理举证、录入组织分，跟我说就行 👋',
      }}
    />
  )
}
