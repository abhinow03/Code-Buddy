# CodeBuddy Evaluation

This checklist is for judging whether CodeBuddy is becoming a useful learning product, not just another AI chat tool.

## Product Metrics

| Metric | Target | Why It Matters |
|---|---:|---|
| Cursor-line success rate | 90%+ | Buddy should answer the line the user is actually on. |
| Comment fit rate | 95%+ | Inserted Buddy comments should wrap cleanly and stay readable. |
| Filler phrase rate | < 2% | Replies should not sound like generic AI tutoring. |
| Hint usefulness | 80%+ | Hint mode should guide without giving away the full fix. |
| Full solution correctness | 85%+ | Full Solution mode should solve the local issue accurately. |
| Review save rate | 30%+ | Users should find explanations worth saving. |
| Daily review completion | 50%+ | The review loop should be lightweight enough to finish. |
| Retention signal | 3+ uses/week | The memory loop should create reasons to return. |

## Manual Test Matrix

Run these in VS Code after installing the latest `.vsix`.

| Feature | Test | Expected Result |
|---|---|---|
| Ask About This Line | Put cursor on a Java/Python line and run `Ctrl+Alt+B`. | Buddy inserts a wrapped comment below the line. |
| Hint For This Line | Run `CodeBuddy: Hint For This Line`. | Comment starts with `Buddy hint:` and avoids the final fix. |
| Full Solution For This Line | Run `CodeBuddy: Full Solution For This Line`. | Comment starts with `Buddy solution:` and gives a direct fix. |
| Clear Buddy Comments | Run `Ctrl+Alt+C`. | Buddy comments are removed from the current file. |
| Review This Later | Ask Buddy something, then run `CodeBuddy: Review This Later`. | A review item is saved for tomorrow. |
| Start Daily Review | Run `CodeBuddy: Start Daily Review` when an item is due. | It asks up to 3 review questions and reschedules them. |
| Mistake Timeline | Run `CodeBuddy: Show Mistake Timeline`. | A Markdown view opens with mistakes, learning debt, reviews, and concepts. |

## Response Quality Rubric

Score each Buddy response from 1 to 5.

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| Context awareness | Misses the line/file | Uses nearby code loosely | Refers to exact line and nearby cause |
| Teaching value | Gives answer only | Explains some why | Builds a clear mental model |
| Brevity | Too long | Slightly wordy | Short and readable |
| Natural voice | Sounds generic | Mostly natural | Feels like a study buddy |
| Mode discipline | Ignores mode | Partially follows mode | Hint/solution/review behave distinctly |

## Release Gate

Before tagging a release, pass:

- `npm run compile`
- `npm run package`
- `npm test`
- No forbidden internal attribution text in tracked project files
- At least 5 manual cursor-line tests across Java and Python
