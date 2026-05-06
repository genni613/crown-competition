import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core'
import { Card, Typography } from 'antd'
import { CopilotPopup } from '@copilotkit/react-core/v2'
import idle00 from '../../assets/copilot/hatch-pet-png-run/frames/idle/00.png'
import idle01 from '../../assets/copilot/hatch-pet-png-run/frames/idle/01.png'
import idle02 from '../../assets/copilot/hatch-pet-png-run/frames/idle/02.png'
import idle03 from '../../assets/copilot/hatch-pet-png-run/frames/idle/03.png'
import idle04 from '../../assets/copilot/hatch-pet-png-run/frames/idle/04.png'
import idle05 from '../../assets/copilot/hatch-pet-png-run/frames/idle/05.png'
import jumping00 from '../../assets/copilot/hatch-pet-png-run/frames/jumping/00.png'
import jumping01 from '../../assets/copilot/hatch-pet-png-run/frames/jumping/01.png'
import jumping02 from '../../assets/copilot/hatch-pet-png-run/frames/jumping/02.png'
import jumping03 from '../../assets/copilot/hatch-pet-png-run/frames/jumping/03.png'
import jumping04 from '../../assets/copilot/hatch-pet-png-run/frames/jumping/04.png'
import review00 from '../../assets/copilot/hatch-pet-png-run/frames/review/00.png'
import review01 from '../../assets/copilot/hatch-pet-png-run/frames/review/01.png'
import review02 from '../../assets/copilot/hatch-pet-png-run/frames/review/02.png'
import review03 from '../../assets/copilot/hatch-pet-png-run/frames/review/03.png'
import waiting00 from '../../assets/copilot/hatch-pet-png-run/frames/waiting/00.png'
import waiting01 from '../../assets/copilot/hatch-pet-png-run/frames/waiting/01.png'
import waiting02 from '../../assets/copilot/hatch-pet-png-run/frames/waiting/02.png'
import waiting03 from '../../assets/copilot/hatch-pet-png-run/frames/waiting/03.png'
import waving00 from '../../assets/copilot/hatch-pet-png-run/frames/waving/00.png'
import waving01 from '../../assets/copilot/hatch-pet-png-run/frames/waving/01.png'
import waving02 from '../../assets/copilot/hatch-pet-png-run/frames/waving/02.png'
import waving03 from '../../assets/copilot/hatch-pet-png-run/frames/waving/03.png'
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

const gibbonAnimations = {
  idle: [idle00, idle01, idle02, idle03, idle04, idle05],
  waving: [waving00, waving01, waving02, waving03],
  jumping: [jumping00, jumping01, jumping02, jumping03, jumping04],
  waiting: [waiting00, waiting01, waiting02, waiting03],
  review: [review00, review01, review02, review03],
} as const

const gibbonAnimationDurations = {
  idle: [1200, 120, 120, 180, 180, 920],
  waving: [150, 150, 150, 260],
  jumping: [90, 100, 100, 100, 130],
  waiting: [260, 150, 150, 320],
  review: [180, 180, 180, 280],
} as const

const DRAG_THRESHOLD = 8
const WAITING_TIMEOUT = 45000
const PET_WIDTH = 122
const PET_HEIGHT = 132

type AmbientState = 'idle' | 'waving' | 'review' | 'waiting'
type MascotAnimation = keyof typeof gibbonAnimations

function loadPetPos(): { right: number; bottom: number } {
  try {
    const s = localStorage.getItem('copilot-pet-pos')
    if (s) { const p = JSON.parse(s); if (typeof p.right === 'number' && typeof p.bottom === 'number') return p }
  } catch { /* ignore */ }
  return { right: 24, bottom: 24 }
}

function savePetPos(pos: { right: number; bottom: number }) {
  try { localStorage.setItem('copilot-pet-pos', JSON.stringify(pos)) } catch { /* ignore */ }
}

function CopilotMascotIcon() {
  const shellRef = useRef<HTMLSpanElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number; moved: boolean } | null>(null)
  const didDragRef = useRef(false)
  const releaseTimerRef = useRef<number | null>(null)
  const waitingTimerRef = useRef<number | null>(null)
  const ambientTimerRef = useRef<number | null>(null)
  const posRef = useRef(loadPetPos())
  const ambientRef = useRef<AmbientState>('idle')

  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [animationStep, setAnimationStep] = useState(0)
  const [ambientState, setAmbientState] = useState<AmbientState>('idle')
  const [bubbleOpen, setBubbleOpen] = useState(true)

  // Keep ref in sync
  useEffect(() => { ambientRef.current = ambientState }, [ambientState])

  // Position sync to parent button via inline styles
  const syncPosition = useCallback((pos: { right: number; bottom: number }) => {
    posRef.current = pos
    const btn = shellRef.current?.closest('button') as HTMLElement | null
    if (btn) {
      btn.style.setProperty('right', `${pos.right}px`, 'important')
      btn.style.setProperty('bottom', `${pos.bottom}px`, 'important')
    }
  }, [])

  useEffect(() => { syncPosition(posRef.current) }, [syncPosition])

  // Bubble auto-hide
  useEffect(() => {
    if (!bubbleOpen) return
    const t = window.setTimeout(() => setBubbleOpen(false), 4000)
    return () => window.clearTimeout(t)
  }, [bubbleOpen])

  // Ambient animation — random state switch when idle
  useEffect(() => {
    if (ambientState !== 'idle' || isHovered || isFocused || isDragging || isPressed) return
    const delay = 4000 + Math.random() * 3000
    ambientTimerRef.current = window.setTimeout(() => {
      const pool = ['waving', 'review'] as const
      setAmbientState(pool[Math.floor(Math.random() * pool.length)])
    }, delay)
    return () => { if (ambientTimerRef.current != null) window.clearTimeout(ambientTimerRef.current) }
  }, [ambientState, isHovered, isFocused, isDragging, isPressed])

  // Return to idle from ambient
  useEffect(() => {
    if (ambientState === 'idle' || ambientState === 'waiting') return
    const dur = 1400 + Math.random() * 900
    const t = window.setTimeout(() => setAmbientState('idle'), dur)
    return () => window.clearTimeout(t)
  }, [ambientState])

  const activeAnimation: MascotAnimation = (() => {
    if (isPressed) return 'jumping'
    if (isDragging || isHovered || isFocused) return 'waving'
    if (ambientState === 'waving') return 'waving'
    if (ambientState === 'review') return 'review'
    if (ambientState === 'waiting') return 'waiting'
    return 'idle'
  })()

  useEffect(() => {
    setAnimationStep(0)
  }, [activeAnimation])

  useEffect(() => {
    const frames = gibbonAnimations[activeAnimation]
    const durations = gibbonAnimationDurations[activeAnimation]
    const currentIndex = Math.min(animationStep, frames.length - 1)
    const isFinalJumpingFrame = activeAnimation === 'jumping' && currentIndex === frames.length - 1
    const t = window.setTimeout(() => {
      setAnimationStep((step) => {
        if (isFinalJumpingFrame) {
          return step
        }
        return (step + 1) % frames.length
      })
    }, durations[currentIndex])
    return () => window.clearTimeout(t)
  }, [activeAnimation, animationStep])

  // Waiting state after inactivity
  const resetWaiting = useCallback(() => {
    if (waitingTimerRef.current != null) window.clearTimeout(waitingTimerRef.current)
    if (ambientRef.current === 'waiting') setAmbientState('idle')
    waitingTimerRef.current = window.setTimeout(() => { setAmbientState('waiting'); waitingTimerRef.current = null }, WAITING_TIMEOUT)
  }, [])

  useEffect(() => { resetWaiting(); return () => { if (waitingTimerRef.current != null) window.clearTimeout(waitingTimerRef.current) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => () => { if (releaseTimerRef.current != null) window.clearTimeout(releaseTimerRef.current) }, [])

  const activeFrames = gibbonAnimations[activeAnimation]
  const currentFrame = activeFrames[Math.min(animationStep, activeFrames.length - 1)]

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    didDragRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRight: posRef.current.right, startBottom: posRef.current.bottom, moved: false }
    setIsPressed(true)
    resetWaiting()
  }, [resetWaiting])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      drag.moved = true
      didDragRef.current = true
      setIsDragging(true)
      setBubbleOpen(false)
      // Add is-dragging to parent button to disable transition
      const btn = shellRef.current?.closest('button') as HTMLElement | null
      if (btn) btn.classList.add('is-dragging')
    }
    if (drag.moved) {
      syncPosition({
        right: Math.max(8, Math.min(window.innerWidth - PET_WIDTH, drag.startRight - dx)),
        bottom: Math.max(8, Math.min(window.innerHeight - PET_HEIGHT, drag.startBottom - dy)),
      })
    }
  }, [syncPosition])

  const handlePointerUp = useCallback(() => {
    const wasDragged = dragRef.current?.moved ?? false
    dragRef.current = null
    setIsDragging(false)
    if (wasDragged) {
      savePetPos(posRef.current)
      const btn = shellRef.current?.closest('button') as HTMLElement | null
      if (btn) btn.classList.remove('is-dragging')
    }
    if (releaseTimerRef.current != null) window.clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = window.setTimeout(() => { setIsPressed(false); releaseTimerRef.current = null }, 520)
    resetWaiting()
  }, [resetWaiting])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) { e.stopPropagation(); didDragRef.current = false; return }
    if (ambientState !== 'idle') setAmbientState('idle')
    resetWaiting()
  }, [ambientState, resetWaiting])

  return (
    <span
      ref={shellRef}
      aria-hidden="true"
      className={`copilot-mascot-shell${isPressed ? ' is-pressed' : ''}${isDragging ? ' is-dragging' : ''}${ambientState === 'waiting' ? ' is-waiting' : ''}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onPointerEnter={() => { setIsHovered(true); resetWaiting() }}
      onPointerLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          setIsPressed(true)
          if (releaseTimerRef.current != null) window.clearTimeout(releaseTimerRef.current)
          releaseTimerRef.current = window.setTimeout(() => { setIsPressed(false); releaseTimerRef.current = null }, 520)
        }
      }}
    >
      {bubbleOpen && (
        <div className="pet-bubble">
          <span>嗨！有什么可以帮你的？ 👋</span>
        </div>
      )}
      <img className="copilot-mascot-frame" src={currentFrame} alt="助手" />
    </span>
  )
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
      toggleButton={{
        openIcon: CopilotMascotIcon,
      }}
    />
  )
}
