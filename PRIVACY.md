# Privacy

CodeBuddy Tutor is designed to be transparent about what it stores and sends.

## Stored Locally

- API keys are stored with VS Code `SecretStorage`.
- Chat history is stored in VS Code workspace state.
- Concepts, mistake patterns, learning debt, and streak state are stored in VS Code workspace state.

## Sent to AI Providers

CodeBuddy sends code context only when the user asks a question or triggers a CodeBuddy action. Depending on the action, this may include:

- The selected code
- The active file content, truncated by `codebuddy.maxContextCharacters`
- The user's question
- Recent chat history
- Local learning-memory summaries such as concepts and mistake patterns

## Telemetry

The current version does not collect telemetry.

## API Keys

Provider API keys are never stored in plaintext settings files by CodeBuddy. They are saved through VS Code's secret storage API.
