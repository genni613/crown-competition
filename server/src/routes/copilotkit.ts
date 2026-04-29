import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express'
import { scoringAgent } from '../agent/scoringAgent'

const runtime = new CopilotRuntime({
  agents: {
    crown_competition_assistant: scoringAgent,
  },
})

export const copilotkitRouter = createCopilotExpressHandler({
  runtime,
  basePath: '/api/copilotkit',
})
