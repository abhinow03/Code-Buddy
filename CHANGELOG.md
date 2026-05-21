# Changelog

## 0.0.1

- Initial MVP scaffold.
- Added tutor chat sidebar.
- Added selected-code explanations.
- Added OpenAI-compatible API calls.
- Added tutor modes and local chat history.

## 0.0.2

- Replaced the left sidebar entry with a visible bottom status bar launcher.

## 0.1.0

- Added streaming responses.
- Added Anthropic, OpenAI, OpenRouter, and local provider support.
- Added Python-first tutor prompt.
- Added context transparency.
- Added concept tracking, review prompts, and learning streak state.

## 0.2.0

- Added mistake memory.
- Added learning debt.
- Added "Check thinking" mental-model correction.
- Added confidence feedback after tutor replies.
- Updated product positioning around turning coding mistakes into personalized lessons.

## 0.2.1

- Simplified the chat UI into a smaller buddy-style chat box.
- Removed visible learning dashboards from the main chat surface.
- Fixed file context capture by remembering the last active editor.

## 0.3.0

- Added `Ctrl+Alt+B` cursor-line quick ask.
- Added cursor line, nearby code, and diagnostics to Buddy context.
- Added inline editor notes with hoverable full replies.
- Added `Ctrl+Alt+C` to clear inline notes.
- Tuned Buddy's voice to be shorter and more conversational.

## 0.3.1

- Changed inline replies into short multiline comment-style notes.
- Added stronger cleanup for filler phrases like "good question" and "let's break it down".
- Limited visible inline text while preserving the full reply on hover.

## 0.4.0

- Switched visible Buddy replies from after-line decorations to real wrapped comments in the editor.
- Added `CodeBuddy: Hint For This Line`.
- Added `CodeBuddy: Full Solution For This Line`.
- Updated clear behavior to remove Buddy comments from the current file.

## 0.5.0

- Added `CodeBuddy: Review This Later`.
- Added `CodeBuddy: Start Daily Review`.
- Added `CodeBuddy: Show Mistake Timeline`.
- Saved review items in workspace state with simple spaced review scheduling.
