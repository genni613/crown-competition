# crown-competition

## CopilotKit model config

You can point the backend assistant at an OpenAI-compatible model provider by setting:

```env
COPILOTKIT_OPENAI_BASE_URL=https://your-provider.example.com/v1
COPILOTKIT_OPENAI_API_KEY=your-api-key
COPILOTKIT_OPENAI_MODEL=gpt-4o
```

Optional overrides:

```env
COPILOTKIT_MODEL=openai/gpt-4o
COPILOTKIT_OPENAI_DEFAULT_HEADERS={"api-key":"your-api-key"}
```
