# CodeBuddy Tutor

CodeBuddy is a VS Code extension for learning while you code.

I made it because autocomplete tools were making it too easy to accept code without really studying it, and copying code into ChatGPT every time was annoying. CodeBuddy sits inside VS Code, reads the file and line you are on, and helps you understand the mistake instead of silently fixing it for you.

It is meant to feel like a small study buddy: ask about the current line, get a short wrapped comment in your file, then keep coding.

## Features

- `Ctrl+Alt+B`: ask about the current line
- `CodeBuddy: Hint For This Line`: get a hint without the full fix
- `CodeBuddy: Full Solution For This Line`: get the direct fix when you want it
- `Ctrl+Alt+C`: clear Buddy comments from the current file
- `CodeBuddy: Review This Later`: save the last explanation for review
- `CodeBuddy: Start Daily Review`: review saved concepts
- `CodeBuddy: Show Mistake Timeline`: see repeated mistakes and learning debt
- Uses VS Code `SecretStorage` for API keys
- Supports Anthropic, OpenAI, OpenRouter, Gemini through OpenAI-compatible mode, and local OpenAI-compatible servers

## Install For Testing

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run compile
```

Package it:

```bash
npm run package
```

Install the generated VSIX:

```bash
code --install-extension codebuddy-tutor-0.5.0.vsix --force
```

Reload VS Code:

```text
Developer: Reload Window
```

## Set API Key

Open the Command Palette and run:

```text
CodeBuddy: Set API Key
```

Paste your provider API key. CodeBuddy stores it using VS Code `SecretStorage`.

## Provider Settings

Open VS Code settings JSON and set your provider.

OpenAI:

```json
{
  "codebuddy.provider": "openai",
  "codebuddy.apiBaseUrl": "https://api.openai.com/v1",
  "codebuddy.model": "gpt-4.1-mini"
}
```

Gemini API key through Google's OpenAI-compatible endpoint:

```json
{
  "codebuddy.provider": "openai",
  "codebuddy.apiBaseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
  "codebuddy.model": "gemini-2.5-flash"
}
```

Local Ollama-compatible setup:

```json
{
  "codebuddy.provider": "local",
  "codebuddy.apiBaseUrl": "http://localhost:11434/v1",
  "codebuddy.model": "llama3.2"
}
```

For local servers that do not require a real key, set any placeholder value as the CodeBuddy API key.

## Development Checks

Run:

```bash
npm test
```

This compiles the extension and runs a smoke check for commands, keybindings, and memory/review markers.

## Privacy

- API keys are stored with VS Code `SecretStorage`.
- Chat history, concepts, mistake memory, saved review items, and streak state are stored in VS Code workspace state.
- Code context is sent to the configured AI provider only when you ask CodeBuddy something.
- No telemetry is included in the current version.
