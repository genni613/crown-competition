const enabled = import.meta.env.VITE_COPILOTKIT_ENABLED === 'true'
const runtimeUrl = import.meta.env.VITE_COPILOTKIT_RUNTIME_URL?.trim()
const agent = import.meta.env.VITE_COPILOTKIT_AGENT?.trim() || 'crown_competition_assistant'
const enableInspector = import.meta.env.VITE_COPILOTKIT_ENABLE_INSPECTOR === 'true'
const showDevConsole = import.meta.env.VITE_COPILOTKIT_SHOW_DEV_CONSOLE === 'true'

export const copilotConfig = {
  agent,
  enableInspector,
  enabled: enabled && Boolean(runtimeUrl),
  showDevConsole,
  runtimeUrl: runtimeUrl || '',
}
