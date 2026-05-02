import { useLocation } from 'react-router-dom'
import { useCopilotReadable } from '@copilotkit/react-core'
import { CopilotPopup } from '@copilotkit/react-core/v2'
import { useAuthStore } from '../../store/authStore'
import { copilotConfig } from './config'

const supportedFeatures = [
  '本系统中管理员的"待办"就是审核待审核的举证，没有其他待办事项。当管理员用户问"有什么要处理"时，直接查看待审核举证数量和内容',
  '查看赛季成绩与排名',
  '查看和解释评分纬度',
  '指导用户提交举证材料',
  '用户问的问题如果超出你的能力范围，直接说明并引导用户去对应页面操作',
]

export function AppCopilotPopup() {
  if (!copilotConfig.enabled) {
    return null
  }

  const location = useLocation()
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

  return (
    <CopilotPopup
      agentId={copilotConfig.agent}
      clickOutsideToClose
      labels={{
        modalHeaderTitle: '皇冠赛助手',
        welcomeMessageText: '我可以帮你理解当前页面、评分规则、举证流程和管理后台能力。',
      }}
    />
  )
}
