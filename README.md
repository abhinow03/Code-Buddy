# CodeBuddy Tutor

CodeBuddy Tutor is a Python-first AI coding tutor for VS Code. It is designed to help developers understand what they are building instead of simply generating code for them.

> CodeBuddy turns daily coding mistakes into personalized lessons.

## Why CodeBuddy Exists

Most AI coding tools optimize for speed: generate code, apply edits, and move on. CodeBuddy optimizes for learning. It explains concepts, gives hints before solutions, checks the user's mental model, remembers recurring mistakes, and turns real coding sessions into review material.

The goal is simple: make the user a stronger developer, not a more dependent one.

## Current Features

- Bottom status-bar launcher inside VS Code
- Compact tutor chat panel
- Streaming AI responses
- Active file and selected code context
- Context transparency before each request
- Right-click selected code -> `CodeBuddy: Ask Selection`
- Teaching modes: `Explain`, `Hint`, `Debug`, `Quiz`, and `Full Answer`
- `Check thinking` workflow for mental-model correction
- Quiet concept tracking from real code
- Quiet mistake memory for repeated bug patterns
- Simplified buddy-style chat UI
- Confidence feedback after explanations: `Not yet`, `Mostly`, `Got it`
- Workspace-level chat history
- Learning streak state
- Secure API key storage with VS Code `SecretStorage`
- Provider support for Anthropic, OpenAI, OpenRouter, and local OpenAI-compatible servers

## Product Direction

CodeBuddy is not meant to become an autonomous coding agent. Its main product loop is:

```text
User writes code
-> User gets stuck or wants to understand something
-> CodeBuddy explains, hints, or checks their thinking
-> CodeBuddy remembers the concept or mistake pattern
-> Later, CodeBuddy reviews that concept using the user's real coding history
```

This makes CodeBuddy closer to a personal coding mentor and learning memory than a code generator.

## Requirements

- VS Code `1.90.0` or newer
- Node.js and npm for development
- An API key for one supported provider, or a local OpenAI-compatible server

## Local Development

Install dependencies:

```bash
npm install
```

Compile the extension:

```bash
npm run compile
```

Run in VS Code:

1. Open this folder in VS Code.
2. Press `F5`.
3. In the Extension Development Host window, click `CodeBuddy` in the bottom status bar.
4. Run `CodeBuddy: Set API Key`.
5. Click into the file you want help with, then ask naturally in the CodeBuddy chat.
6. Select code and use `CodeBuddy: Ask Selection`, or write your understanding and click `Thinking`.

## Configuration

Settings available in VS Code:

| Setting | Description |
|---|---|
| `codebuddy.provider` | `anthropic`, `openai`, `openrouter`, or `local` |
| `codebuddy.apiBaseUrl` | Optional API base URL override |
| `codebuddy.model` | Optional model override |
| `codebuddy.tutorLevel` | `beginner`, `intermediate`, or `advanced` |
| `codebuddy.maxContextCharacters` | Maximum editor context sent with a request |

Default provider models:

| Provider | Default Model |
|---|---|
| Anthropic | `claude-3-5-haiku-latest` |
| OpenAI | `gpt-4.1-mini` |
| OpenRouter | `anthropic/claude-3.5-haiku` |
| Local | `llama3.2` |

Example OpenAI settings:

```json
{
  "codebuddy.provider": "openai",
  "codebuddy.apiBaseUrl": "https://api.openai.com/v1",
  "codebuddy.model": "gpt-4.1-mini"
}
```

Example local Ollama-compatible settings:

```json
{
  "codebuddy.provider": "local",
  "codebuddy.apiBaseUrl": "http://localhost:11434/v1",
  "codebuddy.model": "llama3.2"
}
```

For local servers that do not require a real key, set any placeholder value as the CodeBuddy API key.

## Packaging

Build an installable VSIX:

```bash
npm run package
```

Install the generated package:

```bash
code --install-extension codebuddy-tutor-0.2.1.vsix --force
```

## Privacy Notes

- API keys are stored using VS Code `SecretStorage`.
- Chat history, concept memory, mistake memory, and streak state are stored in VS Code workspace state.
- Code context is sent to the configured AI provider only when the user asks a question or triggers a CodeBuddy action.
- The current version does not include telemetry.

## Roadmap

- Terminal error explanation
- Real spaced repetition with due dates
- Stronger Python concept classifier
- Better local-model onboarding
- Hosted free tier with rate limits
- Marketplace-ready branding and screenshots
