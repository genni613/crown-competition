import { useLocation } from 'react-router-dom'
import { useCopilotReadable } from '@copilotkit/react-core'
import { CopilotPopup } from '@copilotkit/react-core/v2'
import { useAuthStore } from '../../store/authStore'
import { copilotConfig } from './config'

const supportedFeatures = [
  '查看赛季成绩与排名',
  '查看和解释评分维度',
  '指导用户提交举证材料',
  '帮助管理员理解赛季、举证、飞书同步相关页面',
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
