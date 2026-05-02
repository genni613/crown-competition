import { CopilotRuntime } from '@copilotkit/runtime/v2'
import { createCopilotExpressHandler } from '@copilotkit/runtime/v2/express'
import { createScoringAgent } from '../agent/scoringAgent'

const runtime = new CopilotRuntime({
  agents: async ({ request }) => ({
    crown_competition_assistant: await createScoringAgent(request),
  }),
})

export const copilotkitRouter = createCopilotExpressHandler({
  runtime,
  basePath: '/api/copilotkit',
})
