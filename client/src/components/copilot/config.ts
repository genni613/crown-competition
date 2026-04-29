const enabled = import.meta.env.VITE_COPILOTKIT_ENABLED === 'true'
const runtimeUrl = import.meta.env.VITE_COPILOTKIT_RUNTIME_URL?.trim()
const agent = import.meta.env.VITE_COPILOTKIT_AGENT?.trim() || 'crown_competition_assistant'

export const copilotConfig = {
  agent,
  enabled: enabled && Boolean(runtimeUrl),
  runtimeUrl: runtimeUrl || '',
}
