import type { ReactNode } from 'react'
import { CopilotKit } from '@copilotkit/react-core/v2'
import { copilotConfig } from './config'

interface AppCopilotProviderProps {
  children: ReactNode
}

export function AppCopilotProvider({ children }: AppCopilotProviderProps) {
  if (!copilotConfig.enabled) {
    return <>{children}</>
  }

  return (
    <CopilotKit
      agent={copilotConfig.agent}
      credentials="include"
      runtimeUrl={copilotConfig.runtimeUrl}
      showDevConsole={import.meta.env.DEV}
    >
      {children}
    </CopilotKit>
  )
}
