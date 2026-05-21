import * as vscode from "vscode";

const SECRET_API_KEY = "codebuddy.apiKey";
const HISTORY_KEY = "codebuddy.chatHistory";
const CONCEPTS_KEY = "codebuddy.concepts";
const STREAK_KEY = "codebuddy.streak";
const MISTAKES_KEY = "codebuddy.mistakes";
const REVIEW_ITEMS_KEY = "codebuddy.reviewItems";

type ChatRole = "user" | "assistant";
type TutorMode = "explain" | "hint" | "debug" | "quiz" | "answer" | "thinking" | "line";
type AiProvider = "anthropic" | "openai" | "openrouter" | "local";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ConceptRecord {
  name: string;
  count: number;
  lastSeen: string;
  reviewed: boolean;
  confidence: "unknown" | "low" | "medium" | "high";
}

interface MistakeRecord {
  pattern: string;
  concept: string;
  count: number;
  lastSeen: string;
}

interface ReviewItem {
  id: string;
  createdAt: string;
  dueDate: string;
  fileName?: string;
  line?: number;
  concept: string;
  question: string;
  answer: string;
  sourcePrompt: string;
  confidence: "unknown" | "low" | "medium" | "high";
  reviewCount: number;
  lastReviewed?: string;
}

interface LastBuddyExchange {
  question: string;
  answer: string;
  fileName?: string;
  line?: number;
  concepts: string[];
  source: "chat" | "line";
}

interface StreakState {
  current: number;
  lastActiveDate: string;
}

interface EditorContext {
  text: string;
  fileName?: string;
  languageId?: string;
  source: "selection" | "file" | "none";
  cursorLine?: number;
  cursorColumn?: number;
  characterCount: number;
  truncated: boolean;
  pythonFocused: boolean;
}

interface WebviewMessage {
  type: "ask" | "setApiKey" | "clearApiKey" | "clearChat" | "explainSelection" | "reviewConcept" | "checkThinking" | "confidence";
  text?: string;
  mode?: TutorMode;
  apiKey?: string;
  concept?: string;
  confidence?: "low" | "medium" | "high";
}

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
  const chat = new CodeBuddyChat(context, statusBarItem);

  statusBarItem.name = "CodeBuddy Tutor";
  statusBarItem.tooltip = "Open CodeBuddy Tutor Chat";
  statusBarItem.command = "codebuddy.openChat";
  statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
  statusBarItem.show();
  chat.refreshStatusBar();

  context.subscriptions.push(
    statusBarItem,
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      chat.setLastEditor(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      chat.setLastEditor(event.textEditor);
    }),
    vscode.commands.registerCommand("codebuddy.openChat", async () => {
      chat.show();
    }),
    vscode.commands.registerCommand("codebuddy.askLine", async () => {
      await chat.askAboutCursorLine();
    }),
    vscode.commands.registerCommand("codebuddy.hintLine", async () => {
      await chat.askAboutCursorLine("hint");
    }),
    vscode.commands.registerCommand("codebuddy.fullSolutionLine", async () => {
      await chat.askAboutCursorLine("answer");
    }),
    vscode.commands.registerCommand("codebuddy.reviewLater", async () => {
      await chat.reviewLastExplanationLater();
    }),
    vscode.commands.registerCommand("codebuddy.startDailyReview", async () => {
      await chat.startDailyReview();
    }),
    vscode.commands.registerCommand("codebuddy.showMistakeTimeline", async () => {
      await chat.showMistakeTimeline();
    }),
    vscode.commands.registerCommand("codebuddy.clearInlineNotes", () => {
      chat.clearInlineNotes();
    }),
    vscode.commands.registerCommand("codebuddy.explainSelection", async () => {
      chat.show(true);
      await chat.explainSelection();
    }),
    vscode.commands.registerCommand("codebuddy.setApiKey", async () => {
      await chat.promptForApiKey();
    }),
    vscode.commands.registerCommand("codebuddy.clearApiKey", async () => {
      await context.secrets.delete(SECRET_API_KEY);
      chat.postStatus("API key cleared.");
    })
  );
}

export function deactivate() {}

class CodeBuddyChat {
  private panel?: vscode.WebviewPanel;
  private history: ChatMessage[];
  private concepts: ConceptRecord[];
  private mistakes: MistakeRecord[];
  private reviewItems: ReviewItem[];
  private lastBuddyExchange?: LastBuddyExchange;
  private streak: StreakState;
  private lastEditor?: vscode.TextEditor;
  private readonly inlineDecorationType: vscode.TextEditorDecorationType;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {
    this.history = context.workspaceState.get<ChatMessage[]>(HISTORY_KEY, []);
    this.concepts = context.workspaceState.get<ConceptRecord[]>(CONCEPTS_KEY, []);
    this.mistakes = context.workspaceState.get<MistakeRecord[]>(MISTAKES_KEY, []);
    this.reviewItems = context.workspaceState.get<ReviewItem[]>(REVIEW_ITEMS_KEY, []);
    this.streak = context.workspaceState.get<StreakState>(STREAK_KEY, { current: 0, lastActiveDate: "" });
    this.lastEditor = vscode.window.activeTextEditor;
    this.inlineDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
        textDecoration: "none; white-space: pre;"
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    context.subscriptions.push(this.inlineDecorationType);
    void this.touchStreak();
  }

  setLastEditor(editor?: vscode.TextEditor) {
    if (editor && editor.document.uri.scheme !== "vscode-webview") {
      this.lastEditor = editor;
      this.postLearningState();
    }
  }

  show(preserveFocus = false) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, preserveFocus);
      this.postLearningState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "codebuddy.chatPanel",
      "CodeBuddy",
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "codebuddy.svg");
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message));
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.postMessage({ type: "hydrate", history: this.history });
    this.postLearningState();
  }

  async explainSelection() {
    const selectedText = getSelectedText(this.lastEditor);
    if (!selectedText) {
      this.postStatus("Select code first, then ask CodeBuddy.");
      return;
    }

    const prompt = "Explain the selected code. Start by asking one check-your-understanding question, then explain the important parts.";
    await this.askTutor(prompt, "explain", selectedText);
  }

  async askAboutCursorLine(mode: TutorMode = "line") {
    const editor = vscode.window.activeTextEditor ?? this.lastEditor;
    if (!editor) {
      this.postStatus("Open a file first, then press Ctrl+Alt+B.");
      return;
    }

    this.setLastEditor(editor);
    const lineNumber = editor.selection.active.line + 1;
    const currentLine = editor.document.lineAt(editor.selection.active.line).text.trim();
    const title = mode === "hint"
      ? `Ask CodeBuddy for a hint on line ${lineNumber}`
      : mode === "answer"
        ? `Ask CodeBuddy for a full solution around line ${lineNumber}`
        : `Ask CodeBuddy about line ${lineNumber}`;
    const placeHolder = mode === "hint"
      ? "What kind of hint do you want?"
      : mode === "answer"
        ? "What should Buddy solve or fix here?"
        : "Ask like: what's wrong here? why does this work?";
    const question = await vscode.window.showInputBox({
      title,
      prompt: currentLine ? `Line ${lineNumber}: ${currentLine}` : `Line ${lineNumber}`,
      placeHolder,
      ignoreFocusOut: true
    });

    if (!question?.trim()) {
      return;
    }

    await this.askInlineBuddy(question.trim(), editor, mode);
  }

  clearInlineNotes() {
    void this.clearBuddyComments();
  }

  async promptForApiKey() {
    const provider = getProvider();
    const apiKey = await vscode.window.showInputBox({
      title: `Set CodeBuddy API Key (${provider})`,
      prompt: "Stored securely with VS Code SecretStorage.",
      password: true,
      ignoreFocusOut: true
    });

    if (!apiKey) {
      return;
    }

    await this.context.secrets.store(SECRET_API_KEY, apiKey.trim());
    this.postStatus("API key saved.");
  }

  async reviewLastExplanationLater() {
    const exchange = this.lastBuddyExchange;
    if (!exchange) {
      this.postStatus("Ask Buddy something first, then save it for review.");
      return;
    }

    const concept = await vscode.window.showInputBox({
      title: "Save Buddy Review",
      prompt: "Name the concept you want to review later.",
      value: exchange.concepts[0] ?? inferConceptFromText(`${exchange.question}\n${exchange.answer}`),
      ignoreFocusOut: true
    });

    if (!concept?.trim()) {
      return;
    }

    const item: ReviewItem = {
      id: createId(),
      createdAt: todayKey(),
      dueDate: dateKey(addDays(new Date(), 1)),
      fileName: exchange.fileName,
      line: exchange.line,
      concept: concept.trim(),
      question: buildReviewQuestion(concept.trim(), exchange),
      answer: exchange.answer,
      sourcePrompt: exchange.question,
      confidence: "unknown",
      reviewCount: 0
    };

    this.reviewItems.unshift(item);
    this.reviewItems = this.reviewItems.slice(0, 100);
    await this.saveReviewItems();
    this.refreshStatusBar();
    this.postStatus(`Saved ${item.concept} for tomorrow's review.`);
  }

  async startDailyReview() {
    const dueItems = this.getDueReviewItems().slice(0, 3);
    if (dueItems.length === 0) {
      this.postStatus("No reviews due yet.");
      return;
    }

    for (const item of dueItems) {
      const response = await vscode.window.showInputBox({
        title: `CodeBuddy Review: ${item.concept}`,
        prompt: item.question,
        placeHolder: "Type your answer in your own words.",
        ignoreFocusOut: true
      });

      if (response === undefined) {
        break;
      }

      const preview = truncateForMessage(item.answer, 520);
      const confidence = await vscode.window.showInformationMessage(
        `Buddy check: ${preview}`,
        "Not yet",
        "Mostly",
        "Got it"
      );

      if (!confidence) {
        break;
      }

      item.reviewCount += 1;
      item.lastReviewed = todayKey();
      item.confidence = confidence === "Got it" ? "high" : confidence === "Mostly" ? "medium" : "low";
      item.dueDate = nextReviewDate(item.confidence);
    }

    await this.saveReviewItems();
    this.refreshStatusBar();
    this.postStatus("Daily review updated.");
  }

  async showMistakeTimeline() {
    const lines = buildMistakeTimeline(this.mistakes, this.concepts, this.reviewItems);
    const document = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: lines.join("\n")
    });
    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
  }

  refreshStatusBar() {
    const dueCount = this.concepts.filter((concept) => !concept.reviewed).length + this.getDueReviewItems().length;
    this.statusBarItem.text = dueCount > 0
      ? `$(comment-discussion) CodeBuddy ${dueCount}`
      : "$(comment-discussion) CodeBuddy";
    this.statusBarItem.tooltip = dueCount > 0
      ? `Open CodeBuddy Tutor Chat - ${dueCount} concept review${dueCount === 1 ? "" : "s"} waiting`
      : "Open CodeBuddy Tutor Chat";
  }

  private async handleMessage(message: WebviewMessage) {
    switch (message.type) {
      case "ask":
        await this.askTutor(message.text ?? "", message.mode ?? "explain");
        break;
      case "setApiKey":
        if (message.apiKey?.trim()) {
          await this.context.secrets.store(SECRET_API_KEY, message.apiKey.trim());
          this.postStatus("API key saved.");
        }
        break;
      case "clearApiKey":
        await this.context.secrets.delete(SECRET_API_KEY);
        this.postStatus("API key cleared.");
        break;
      case "clearChat":
        this.history = [];
        await this.saveHistory();
        this.postMessage({ type: "hydrate", history: this.history });
        break;
      case "explainSelection":
        await this.explainSelection();
        break;
      case "reviewConcept":
        await this.reviewConcept(message.concept);
        break;
      case "checkThinking":
        await this.checkThinking(message.text ?? "");
        break;
      case "confidence":
        await this.recordConfidence(message.confidence);
        break;
    }
  }

  private async checkThinking(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      this.postStatus("Write what you think is happening first.");
      return;
    }

    await this.askTutor(
      `The user is explaining their mental model. Compare it with the actual code context. Correct misconceptions clearly and kindly. User's thinking: ${trimmed}`,
      "thinking"
    );
  }

  private async askTutor(userText: string, mode: TutorMode, forcedContext?: string) {
    const trimmed = userText.trim();
    if (!trimmed) {
      this.postStatus("Ask me something about your code.");
      return;
    }

    const apiKey = await this.context.secrets.get(SECRET_API_KEY);
    if (!apiKey) {
      this.postStatus("Set your API key first with CodeBuddy: Set API Key.");
      this.postMessage({ type: "needsApiKey" });
      return;
    }

    await this.touchStreak();

    const config = vscode.workspace.getConfiguration("codebuddy");
    const provider = getProvider();
    const apiBaseUrl = getApiBaseUrl(provider, config);
    const model = getModel(provider, config);
    const level = config.get<string>("tutorLevel", "beginner");
    const context = forcedContext
      ? buildForcedContext(forcedContext, config.get<number>("maxContextCharacters", 6000))
      : collectEditorContext(config.get<number>("maxContextCharacters", 6000), this.lastEditor);
    const priorHistory = this.history.slice(-8);
    const detectedConcepts = detectConcepts(`${trimmed}\n${context.text}`);
    const detectedMistakes = detectMistakes(`${trimmed}\n${context.text}`);

    await this.recordConcepts(detectedConcepts);
    await this.recordMistakes(detectedMistakes);
    this.postMessage({ type: "context", context: summarizeContext(context, detectedConcepts, detectedMistakes, provider, model) });

    this.appendHistory({ role: "user", content: trimmed });
    this.postMessage({ type: "streamStart" });

    let assistantText = "";

    try {
      for await (const chunk of requestTutorReplyStream({
        provider,
        apiBaseUrl,
        apiKey,
        model,
        level,
        mode,
        userText: trimmed,
        context,
        history: priorHistory,
        learnedConcepts: this.concepts,
        mistakes: this.mistakes
      })) {
        assistantText += chunk;
        this.postMessage({ type: "streamDelta", text: chunk });
      }

      const finalText = assistantText.trim();
      if (!finalText) {
        throw new Error("The AI API returned an empty response.");
      }

      this.appendHistory({ role: "assistant", content: finalText }, false);
      this.rememberExchange({
        question: trimmed,
        answer: finalText,
        fileName: context.fileName,
        line: context.cursorLine,
        concepts: detectedConcepts,
        source: "chat"
      });
      this.postMessage({ type: "streamDone" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while calling the AI API.";
      this.postStatus(message);
      this.postMessage({ type: "error", error: message });
    }
  }

  private async askInlineBuddy(userText: string, editor: vscode.TextEditor, mode: TutorMode) {
    const apiKey = await this.context.secrets.get(SECRET_API_KEY);
    if (!apiKey) {
      this.postStatus("Set your API key first with CodeBuddy: Set API Key.");
      return;
    }

    await this.touchStreak();

    const config = vscode.workspace.getConfiguration("codebuddy");
    const provider = getProvider();
    const apiBaseUrl = getApiBaseUrl(provider, config);
    const model = getModel(provider, config);
    const level = config.get<string>("tutorLevel", "beginner");
    const context = collectCursorContext(config.get<number>("maxContextCharacters", 6000), editor);
    const detectedConcepts = detectConcepts(`${userText}\n${context.text}`);
    const detectedMistakes = detectMistakes(`${userText}\n${context.text}`);

    await this.recordConcepts(detectedConcepts);
    await this.recordMistakes(detectedMistakes);

    const line = editor.selection.active.line;
    this.setTemporaryInlineNote(editor, line, "Buddy: thinking...");

    let answer = "";
    try {
      for await (const chunk of requestTutorReplyStream({
        provider,
        apiBaseUrl,
        apiKey,
        model,
        level,
        mode,
        userText,
        context,
        history: this.history.slice(-4),
        learnedConcepts: this.concepts,
        mistakes: this.mistakes
      })) {
        answer += chunk;
      }

      const finalAnswer = cleanBuddyAnswer(answer);
      editor.setDecorations(this.inlineDecorationType, []);
      await this.insertBuddyComment(editor, line, finalAnswer, mode);
      this.appendHistory({ role: "user", content: `Line ${context.cursorLine}: ${userText}` }, false);
      this.appendHistory({ role: "assistant", content: finalAnswer }, false);
      this.rememberExchange({
        question: userText,
        answer: finalAnswer,
        fileName: context.fileName,
        line: context.cursorLine,
        concepts: detectedConcepts,
        source: "line"
      });
      this.postStatus(`Buddy added a wrapped comment near line ${context.cursorLine}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while calling the AI API.";
      this.setTemporaryInlineNote(editor, line, "Buddy: could not answer here");
      this.postStatus(message);
    }
  }

  private setTemporaryInlineNote(editor: vscode.TextEditor, line: number, text: string) {
    const document = editor.document;
    const targetLine = Math.min(Math.max(line, 0), document.lineCount - 1);
    const end = document.lineAt(targetLine).range.end;
    editor.setDecorations(this.inlineDecorationType, [{
      range: new vscode.Range(end, end),
      renderOptions: {
        after: {
          contentText: text
        }
      }
    }]);
  }

  private async insertBuddyComment(editor: vscode.TextEditor, line: number, answer: string, mode: TutorMode) {
    const document = editor.document;
    const targetLine = Math.min(Math.max(line, 0), document.lineCount - 1);
    const indentation = document.lineAt(targetLine).text.match(/^\s*/)?.[0] ?? "";
    const commentLines = formatBuddyCommentBlock(answer, document.languageId, mode, indentation);
    const newline = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
    const insertLine = Math.min(targetLine + 1, document.lineCount);
    const insertPosition = new vscode.Position(insertLine, 0);

    await editor.edit((editBuilder) => {
      editBuilder.insert(insertPosition, `${commentLines.join(newline)}${newline}`);
    });
  }

  private async clearBuddyComments() {
    const editor = vscode.window.activeTextEditor ?? this.lastEditor;
    if (!editor) {
      this.postStatus("Open a file first.");
      return;
    }

    const document = editor.document;
    const ranges: vscode.Range[] = [];
    for (let line = 0; line < document.lineCount; line++) {
      if (document.lineAt(line).text.includes("Buddy:")) {
        ranges.push(document.lineAt(line).rangeIncludingLineBreak);
      }
    }

    if (ranges.length === 0) {
      this.postStatus("No Buddy comments found in this file.");
      return;
    }

    await editor.edit((editBuilder) => {
      for (const range of ranges.reverse()) {
        editBuilder.delete(range);
      }
    });
    this.postStatus(`Cleared ${ranges.length} Buddy comment${ranges.length === 1 ? "" : "s"}.`);
  }

  private appendHistory(message: ChatMessage, render = true) {
    this.history.push(message);
    if (this.history.length > 40) {
      this.history = this.history.slice(-40);
    }
    void this.saveHistory();
    if (render) {
      this.postMessage({ type: "message", message });
    }
  }

  private rememberExchange(exchange: LastBuddyExchange) {
    this.lastBuddyExchange = {
      ...exchange,
      concepts: exchange.concepts.length > 0
        ? exchange.concepts
        : [inferConceptFromText(`${exchange.question}\n${exchange.answer}`)]
    };
  }

  private async reviewConcept(conceptName?: string) {
    const concept = this.concepts.find((item) => item.name === conceptName) ?? this.concepts.find((item) => !item.reviewed);
    if (!concept) {
      this.postStatus("No concepts waiting for review.");
      return;
    }

    concept.reviewed = true;
    concept.lastSeen = todayKey();
    await this.saveConcepts();
    this.refreshStatusBar();
    this.postLearningState();
    await this.askTutor(`Give me a daily review from my real coding history. Focus on ${concept.name}. Ask one short question first, then wait for my answer. If there is a related repeated mistake, mention the pattern after the question.`, "quiz");
  }

  private async recordConcepts(concepts: string[]) {
    if (concepts.length === 0) {
      return;
    }

    const today = todayKey();
    for (const name of concepts) {
      const existing = this.concepts.find((concept) => concept.name === name);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = today;
        existing.reviewed = false;
      } else {
        this.concepts.push({ name, count: 1, lastSeen: today, reviewed: false, confidence: "unknown" });
      }
    }

    this.concepts = this.concepts
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || b.count - a.count)
      .slice(0, 30);
    await this.saveConcepts();
    this.refreshStatusBar();
    this.postLearningState();
  }

  private async recordMistakes(mistakes: MistakeRecord[]) {
    if (mistakes.length === 0) {
      return;
    }

    const today = todayKey();
    for (const mistake of mistakes) {
      const existing = this.mistakes.find((item) => item.pattern === mistake.pattern);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = today;
      } else {
        this.mistakes.push({ ...mistake, count: 1, lastSeen: today });
      }
    }

    this.mistakes = this.mistakes
      .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, 20);
    await this.context.workspaceState.update(MISTAKES_KEY, this.mistakes);
    this.postLearningState();
  }

  private async recordConfidence(confidence?: "low" | "medium" | "high") {
    if (!confidence) {
      return;
    }

    const recent = this.concepts.filter((concept) => concept.lastSeen === todayKey()).slice(0, 3);
    for (const concept of recent) {
      concept.confidence = confidence;
      concept.reviewed = confidence === "high";
    }

    await this.saveConcepts();
    this.refreshStatusBar();
    this.postLearningState();
    this.postStatus(confidence === "low" ? "Marked for another pass." : "Confidence saved.");
  }

  private async touchStreak() {
    const today = todayKey();
    if (this.streak.lastActiveDate === today) {
      return;
    }

    const yesterday = dateKey(addDays(new Date(), -1));
    this.streak = {
      current: this.streak.lastActiveDate === yesterday ? this.streak.current + 1 : 1,
      lastActiveDate: today
    };

    await this.context.workspaceState.update(STREAK_KEY, this.streak);
    this.postLearningState();
  }

  private postLearningState() {
    this.postMessage({
      type: "learningState",
      concepts: this.concepts.slice(0, 8),
      mistakes: this.mistakes.slice(0, 5),
      learningDebt: getLearningDebt(this.concepts, this.mistakes).slice(0, 5),
      streak: this.streak,
      fileName: this.lastEditor?.document.fileName,
      languageId: this.lastEditor?.document.languageId
    });
  }

  private async saveHistory() {
    await this.context.workspaceState.update(HISTORY_KEY, this.history);
  }

  private async saveConcepts() {
    await this.context.workspaceState.update(CONCEPTS_KEY, this.concepts);
  }

  private async saveReviewItems() {
    await this.context.workspaceState.update(REVIEW_ITEMS_KEY, this.reviewItems);
  }

  private getDueReviewItems() {
    const today = todayKey();
    return this.reviewItems
      .filter((item) => item.dueDate <= today && item.confidence !== "high")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt));
  }

  postStatus(text: string) {
    vscode.window.setStatusBarMessage(`CodeBuddy: ${text}`, 5000);
    this.postMessage({ type: "status", text });
  }

  private postMessage(message: unknown) {
    void this.panel?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "styles.css"));
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${styleUri}" rel="stylesheet">
  <title>CodeBuddy Tutor</title>
</head>
<body>
  <main class="app">
    <header class="topbar">
      <div>
        <h1>CodeBuddy</h1>
        <p id="fileStatus">No file attached yet</p>
      </div>
      <button id="clearChat" class="icon-button" title="Clear chat" aria-label="Clear chat">Clear</button>
    </header>
    <section id="messages" class="messages" aria-live="polite"></section>

    <section class="composer">
      <textarea id="input" rows="3" placeholder="Ask CodeBuddy..."></textarea>
      <div class="actions">
        <button id="explainSelection" class="secondary">Selection</button>
        <button id="checkThinking" class="secondary">Thinking</button>
        <button id="send" class="primary">Send</button>
      </div>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

async function* requestTutorReplyStream(options: {
  provider: AiProvider;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  level: string;
  mode: TutorMode;
  userText: string;
  context: EditorContext;
  history: ChatMessage[];
  learnedConcepts: ConceptRecord[];
  mistakes: MistakeRecord[];
}): AsyncGenerator<string> {
  if (options.provider === "anthropic") {
    yield* requestAnthropicStream(options);
    return;
  }

  yield* requestOpenAiCompatibleStream(options);
}

async function* requestOpenAiCompatibleStream(options: {
  provider: AiProvider;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  level: string;
  mode: TutorMode;
  userText: string;
  context: EditorContext;
  history: ChatMessage[];
  learnedConcepts: ConceptRecord[];
  mistakes: MistakeRecord[];
}): AsyncGenerator<string> {
  const response = await fetch(`${options.apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.provider === "openrouter" ? {
        "HTTP-Referer": "https://codebuddy.local",
        "X-Title": "CodeBuddy Tutor"
      } : {})
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.35,
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt(options.level, options.mode, options.learnedConcepts, options.mistakes) },
        ...options.history.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content: buildUserPrompt(options.userText, options.context) }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(formatApiError(response.status, await response.text()));
  }

  let yielded = false;
  for await (const event of parseSse(response)) {
    if (event === "[DONE]") {
      break;
    }

    try {
      const data = JSON.parse(event) as {
        choices?: Array<{ delta?: { content?: string }, message?: { content?: string } }>;
      };
      const chunk = data.choices?.[0]?.delta?.content ?? data.choices?.[0]?.message?.content ?? "";
      if (chunk) {
        yielded = true;
        yield chunk;
      }
    } catch {
      // Ignore malformed stream chunks and keep reading.
    }
  }

  if (!yielded) {
    throw new Error("The AI API returned an empty response.");
  }
}

async function* requestAnthropicStream(options: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  level: string;
  mode: TutorMode;
  userText: string;
  context: EditorContext;
  history: ChatMessage[];
  learnedConcepts: ConceptRecord[];
  mistakes: MistakeRecord[];
}): AsyncGenerator<string> {
  const response = await fetch(`${options.apiBaseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 1200,
      temperature: 0.35,
      stream: true,
      system: buildSystemPrompt(options.level, options.mode, options.learnedConcepts, options.mistakes),
      messages: [
        ...options.history.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content: buildUserPrompt(options.userText, options.context) }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(formatApiError(response.status, await response.text()));
  }

  let yielded = false;
  for await (const event of parseSse(response)) {
    try {
      const data = JSON.parse(event) as {
        type?: string;
        delta?: { text?: string };
      };
      const chunk = data.type === "content_block_delta" ? data.delta?.text ?? "" : "";
      if (chunk) {
        yielded = true;
        yield chunk;
      }
    } catch {
      // Ignore malformed stream chunks and keep reading.
    }
  }

  if (!yielded) {
    throw new Error("The AI API returned an empty response.");
  }
}

async function* parseSse(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) {
        yield data;
      }
    }
  }
}

function buildSystemPrompt(level: string, mode: TutorMode, concepts: ConceptRecord[], mistakes: MistakeRecord[]): string {
  const learned = concepts.slice(0, 8).map((concept) => concept.name).join(", ") || "none yet";
  const mistakeMemory = mistakes.slice(0, 5).map((mistake) => `${mistake.pattern} (${mistake.count}x)`).join(", ") || "none yet";
  const debt = getLearningDebt(concepts, mistakes).slice(0, 5).join(", ") || "none yet";
  return [
    "You are CodeBuddy, a study buddy inside VS Code.",
    "Talk like a calm friend sitting next to the user while they code.",
    "Your job is to help the user understand code, not write it for them.",
    "Voice rules:",
    "1. Keep replies short. Usually 1-3 sentences.",
    "2. No essay tone. No markdown headings.",
    "3. Never use filler praise or setup phrases like 'great question', 'good question', 'certainly', 'let us/let's break it down', 'nice catch', or 'you're right to ask'.",
    "4. Say 'this line', 'right here', or the real line number when cursor context is available.",
    "5. If the user asks what is wrong, answer from the cursor line and nearby code. Do not ask them to paste code.",
    "6. Ask one natural follow-up question only when it helps.",
    "7. Never write a complete solution unless the user asks for the full answer or the selected mode is Full Answer.",
    "8. When shown a bug or error, explain why it happens before suggesting a fix.",
    "9. If the user is going in the wrong direction, say so clearly but kindly.",
    "If editor context is provided, do not ask the user to paste the code. Use the provided file or selection context directly.",
    "Primary v1 focus: Python. If the context is not Python, say briefly that CodeBuddy is optimized for Python but still help with the concept.",
    "Novelty behavior: maintain a mentor-like memory. When relevant, connect the current question to repeated mistakes, learning debt, or concepts seen earlier.",
    "When the user's mental model is wrong, correct the mental model before giving code.",
    `User level: ${level}.`,
    `Concepts already seen this session: ${learned}.`,
    `Repeated mistake patterns: ${mistakeMemory}.`,
    `Current learning debt: ${debt}.`,
    getModeInstruction(mode)
  ].join("\n");
}

function buildUserPrompt(userText: string, context: EditorContext): string {
  const contextBlock = context.text
    ? `Editor context sent to you:\n${context.text}`
    : "No editor context was available.";

  return [
    userText,
    "",
    contextBlock
  ].join("\n");
}

function formatApiError(status: number, body: string): string {
  const fallback = `API request failed (${status}): ${body.slice(0, 300)}`;

  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        type?: string;
        code?: string;
      } | string;
    };
    const error = parsed.error;
    const message = typeof error === "string" ? error : error?.message;
    const type = typeof error === "string" ? undefined : error?.type;
    const code = typeof error === "string" ? undefined : error?.code;

    if (status === 401) {
      return "The API key was rejected. Check the key, provider, and base URL in CodeBuddy settings.";
    }

    if (status === 429 && (type === "insufficient_quota" || code === "insufficient_quota")) {
      return "Your API key is valid, but the account has no remaining quota or billing is not active. Add billing/credits, use another API key, or switch providers.";
    }

    if (status === 429) {
      return "The API provider is rate limiting requests right now. Wait a bit, use a smaller model, or switch providers.";
    }

    if (message) {
      return `API request failed (${status}): ${message}`;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function getModeInstruction(mode: TutorMode): string {
  switch (mode) {
    case "hint":
      return "Mode: Hint. Give only a hint. Do not give the final fix or full solution.";
    case "debug":
      return "Mode: Debug. Diagnose what is wrong and why. Do not fix it yet unless asked.";
    case "quiz":
      return "Mode: Quiz Me. Ask one short question first. Wait for the user's answer when appropriate.";
    case "answer":
      return "Mode: Full Answer. Provide the direct solution or fix and explain why it works, still briefly.";
    case "thinking":
      return "Mode: Explain My Thinking. Compare the user's explanation with the code. Identify what is right, what is wrong, and the corrected mental model. Do not write a full solution unless asked.";
    case "line":
      return "Mode: Cursor Line Buddy. Answer the user's question about the current cursor line in 1-2 short sentences. If the line itself is fine, say that and point to the nearby line that matters. No filler.";
    case "explain":
    default:
      return "Mode: Explain. Break down what the code does, line by line if useful.";
  }
}

function collectEditorContext(maxCharacters: number, preferredEditor?: vscode.TextEditor): EditorContext {
  const editor = preferredEditor ?? vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
  if (!editor) {
    return emptyContext();
  }

  const document = editor.document;
  const selectedText = getSelectedText(editor);
  const source = selectedText ? "selection" : "file";
  const rawText = selectedText || document.getText();
  const startLine = selectedText ? editor.selection.start.line + 1 : 1;
  const lineInfo = selectedText ? `Selection starts at line: ${startLine}` : "Full file context";
  const header = [
    `File: ${document.fileName}`,
    `Language: ${document.languageId}`,
    lineInfo
  ].join("\n");
  const contextText = `${header}\n\`\`\`${document.languageId}\n${rawText}\n\`\`\``;
  const truncatedText = truncateContext(contextText, maxCharacters);

  return {
    text: truncatedText,
    fileName: document.fileName,
    languageId: document.languageId,
    source,
    cursorLine: editor.selection.active.line + 1,
    cursorColumn: editor.selection.active.character + 1,
    characterCount: truncatedText.length,
    truncated: truncatedText.length < contextText.length,
    pythonFocused: document.languageId === "python" || document.fileName.toLowerCase().endsWith(".py")
  };
}

function buildForcedContext(text: string, maxCharacters: number): EditorContext {
  const editor = vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
  const document = editor?.document;
  const languageId = document?.languageId ?? "plaintext";
  const header = [
    document?.fileName ? `File: ${document.fileName}` : "File: unknown",
    `Language: ${languageId}`,
    "Selected code"
  ].join("\n");
  const contextText = `${header}\n\`\`\`${languageId}\n${text}\n\`\`\``;
  const truncatedText = truncateContext(contextText, maxCharacters);

  return {
    text: truncatedText,
    fileName: document?.fileName,
    languageId,
    source: "selection",
    cursorLine: editor ? editor.selection.active.line + 1 : undefined,
    cursorColumn: editor ? editor.selection.active.character + 1 : undefined,
    characterCount: truncatedText.length,
    truncated: truncatedText.length < contextText.length,
    pythonFocused: languageId === "python" || Boolean(document?.fileName.toLowerCase().endsWith(".py"))
  };
}

function summarizeContext(context: EditorContext, concepts: string[], mistakes: MistakeRecord[], provider: AiProvider, model: string) {
  return {
    source: context.source,
    fileName: context.fileName,
    languageId: context.languageId,
    cursorLine: context.cursorLine,
    cursorColumn: context.cursorColumn,
    characterCount: context.characterCount,
    truncated: context.truncated,
    pythonFocused: context.pythonFocused,
    concepts,
    mistakes: mistakes.map((mistake) => mistake.pattern),
    provider,
    model
  };
}

function emptyContext(): EditorContext {
  return {
    text: "",
    source: "none",
    cursorLine: undefined,
    cursorColumn: undefined,
    characterCount: 0,
    truncated: false,
    pythonFocused: false
  };
}

function collectCursorContext(maxCharacters: number, editor: vscode.TextEditor): EditorContext {
  const document = editor.document;
  const cursor = editor.selection.active;
  const selectedText = getSelectedText(editor);
  const startLine = Math.max(0, cursor.line - 12);
  const endLine = Math.min(document.lineCount - 1, cursor.line + 12);
  const nearbyLines: string[] = [];

  for (let line = startLine; line <= endLine; line++) {
    const marker = line === cursor.line ? ">>" : "  ";
    nearbyLines.push(`${marker} ${line + 1}: ${document.lineAt(line).text}`);
  }

  const diagnostics = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diagnostic) => diagnostic.range.intersection(new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER)))
    .map((diagnostic) => {
      const severity = vscode.DiagnosticSeverity[diagnostic.severity];
      return `Line ${diagnostic.range.start.line + 1} ${severity}: ${diagnostic.message}`;
    });

  const header = [
    `File: ${document.fileName}`,
    `Language: ${document.languageId}`,
    `Cursor line: ${cursor.line + 1}`,
    `Cursor column: ${cursor.character + 1}`,
    `Current line text: ${document.lineAt(cursor.line).text}`,
    selectedText ? `Selected code:\n${selectedText}` : "Selected code: none",
    diagnostics.length ? `Diagnostics nearby:\n${diagnostics.join("\n")}` : "Diagnostics nearby: none",
    "Nearby code with >> marking the cursor line:",
    `\`\`\`${document.languageId}`,
    nearbyLines.join("\n"),
    "```"
  ].join("\n");
  const truncatedText = truncateContext(header, maxCharacters);

  return {
    text: truncatedText,
    fileName: document.fileName,
    languageId: document.languageId,
    source: selectedText ? "selection" : "file",
    cursorLine: cursor.line + 1,
    cursorColumn: cursor.character + 1,
    characterCount: truncatedText.length,
    truncated: truncatedText.length < header.length,
    pythonFocused: document.languageId === "python" || document.fileName.toLowerCase().endsWith(".py")
  };
}

function getSelectedText(editor = vscode.window.activeTextEditor): string {
  if (!editor || editor.selection.isEmpty) {
    return "";
  }

  return editor.document.getText(editor.selection);
}

function truncateContext(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }

  return `${text.slice(0, maxCharacters)}\n\n[Context truncated by CodeBuddy]`;
}

function cleanBuddyAnswer(text: string): string {
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\bthe code provided\b/gi, "this code")
    .replace(/\b(that'?s\s+)?(a\s+)?(great|good)\s+question(\s+to\s+ask)?[.!]?\s*/gi, "")
    .replace(/\b(certainly|sure|absolutely)[,.!]?\s*/gi, "")
    .replace(/\blet'?s\s+break\s+(it|this)\s+down[,.!]?\s*/gi, "")
    .replace(/\byou'?re\s+right\s+to\s+ask[,.!]?\s*/gi, "")
    .replace(/\bnice\s+catch[,.!]?\s*/gi, "")
    .replace(/\bin essence,?\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatBuddyCommentBlock(text: string, languageId: string, mode: TutorMode, indentation: string): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, mode === "answer" ? 8 : mode === "hint" ? 2 : 3)
    .join(" ");
  const compact = sentences || text.replace(/\s+/g, " ");
  const maxLines = mode === "answer" ? 12 : mode === "hint" ? 3 : 5;
  const lines = wrapText(compact, 58).slice(0, maxLines);
  const prefix = getCommentPrefix(languageId);
  const label = mode === "hint"
    ? "Buddy hint:"
    : mode === "answer"
      ? "Buddy solution:"
      : "Buddy:";

  return lines
    .map((line, index) => {
      const lead = index === 0 ? `${label} ` : `${" ".repeat(label.length)} `;
      return `${indentation}${prefix} ${lead}${line}`;
    });
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [text.slice(0, width)];
}

function getCommentPrefix(languageId: string): string {
  if (["python", "ruby", "shellscript", "r"].includes(languageId)) {
    return "#";
  }

  if (["sql", "lua", "haskell"].includes(languageId)) {
    return "--";
  }

  return "//";
}

function detectConcepts(text: string): string[] {
  const lower = text.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ["functions", /\bdef\s+\w+|\bfunction\b/],
    ["classes", /\bclass\s+\w+/],
    ["loops", /\bfor\b|\bwhile\b/],
    ["conditionals", /\bif\b|\belif\b|\belse\b/],
    ["lists", /\blist\b|\[[^\]]*]/],
    ["dictionaries", /\bdict\b|{[^}]*:\s*[^}]*}/],
    ["list comprehension", /\[[^\]]+\bfor\b[^\]]+]/],
    ["exceptions", /\btry\b|\bexcept\b|\bcatch\b|\bthrow\b|\braise\b/],
    ["async/await", /\basync\b|\bawait\b/],
    ["decorators", /@\w+/],
    ["imports", /\bimport\b|\bfrom\s+\w+\s+import\b/],
    ["objects", /\bself\b|\bthis\b|\bobject\b/],
    ["recursion", /\brecursion\b|\brecursive\b/],
    ["testing", /\bassert\b|\bpytest\b|\bunittest\b/]
  ];

  return checks
    .filter(([, pattern]) => pattern.test(lower))
    .map(([name]) => name)
    .slice(0, 6);
}

function detectMistakes(text: string): MistakeRecord[] {
  const lower = text.toLowerCase();
  const checks: Array<[string, string, RegExp]> = [
    ["None/null value confusion", "None/null handling", /\bnonetype\b|\bnullpointer\b|\bcannot read propert(y|ies) of (null|undefined)|\bundefined\b|\bnull\b/],
    ["Index out of range", "list indexing", /\bindexerror\b|\bindex out of|out of bounds/],
    ["Type mismatch", "types", /\btypeerror\b|\bincompatible types\b|\bcannot convert\b/],
    ["Name not defined", "scope", /\bnameerror\b|\bis not defined\b|\bcannot find symbol\b/],
    ["Object identity confusion", "object references", /\b==\b|\bis\b|\bequals\(|same object|reference/],
    ["Import/module confusion", "imports", /\bmodulenotfounderror\b|\bimporterror\b|\bpackage .* does not exist\b/],
    ["Async ordering confusion", "async/await", /\basync\b|\bawait\b|\bpromise\b|\bcoroutine\b/],
    ["Constructor/state confusion", "classes", /\bconstructor\b|\b__init__\b|\bthis\.|\bself\./]
  ];

  return checks
    .filter(([, , pattern]) => pattern.test(lower))
    .map(([pattern, concept]) => ({
      pattern,
      concept,
      count: 1,
      lastSeen: todayKey()
    }))
    .slice(0, 4);
}

function getLearningDebt(concepts: ConceptRecord[], mistakes: MistakeRecord[]): string[] {
  const debt = new Map<string, number>();
  for (const concept of concepts) {
    const confidence = concept.confidence ?? "unknown";
    if (!concept.reviewed || confidence === "low" || concept.count >= 3) {
      debt.set(concept.name, (debt.get(concept.name) ?? 0) + concept.count + (confidence === "low" ? 3 : 0));
    }
  }

  for (const mistake of mistakes) {
    if (mistake.count >= 2) {
      debt.set(mistake.concept, (debt.get(mistake.concept) ?? 0) + mistake.count + 2);
    }
  }

  return [...debt.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferConceptFromText(text: string): string {
  return detectConcepts(text)[0] ?? detectMistakes(text)[0]?.concept ?? "code understanding";
}

function buildReviewQuestion(concept: string, exchange: LastBuddyExchange): string {
  const location = exchange.fileName
    ? `${shortFileName(exchange.fileName)}${exchange.line ? ` line ${exchange.line}` : ""}`
    : "your earlier code";

  if (exchange.source === "line") {
    return `In ${location}, what was the key idea behind ${concept}?`;
  }

  return `From your earlier Buddy explanation, how would you explain ${concept} in your own words?`;
}

function truncateForMessage(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trim()}...`;
}

function nextReviewDate(confidence: "unknown" | "low" | "medium" | "high"): string {
  const days = confidence === "high" ? 7 : confidence === "medium" ? 3 : 1;
  return dateKey(addDays(new Date(), days));
}

function buildMistakeTimeline(mistakes: MistakeRecord[], concepts: ConceptRecord[], reviewItems: ReviewItem[]): string[] {
  const dueReviews = reviewItems.filter((item) => item.dueDate <= todayKey() && item.confidence !== "high");
  const learningDebt = getLearningDebt(concepts, mistakes);
  const lines = [
    "# CodeBuddy Memory",
    "",
    `Generated: ${todayKey()}`,
    "",
    "## Repeated Mistakes",
    ""
  ];

  if (mistakes.length === 0) {
    lines.push("- No repeated mistake patterns yet.");
  } else {
    for (const mistake of mistakes.slice(0, 10)) {
      lines.push(`- ${mistake.pattern}: ${mistake.count} time${mistake.count === 1 ? "" : "s"}; concept: ${mistake.concept}; last seen: ${mistake.lastSeen}`);
    }
  }

  lines.push("", "## Learning Debt", "");
  if (learningDebt.length === 0) {
    lines.push("- Nothing is marked as shaky right now.");
  } else {
    for (const concept of learningDebt.slice(0, 10)) {
      lines.push(`- ${concept}`);
    }
  }

  lines.push("", "## Reviews Due", "");
  if (dueReviews.length === 0) {
    lines.push("- No reviews due today.");
  } else {
    for (const item of dueReviews.slice(0, 10)) {
      const location = item.fileName ? ` (${shortFileName(item.fileName)}${item.line ? `:${item.line}` : ""})` : "";
      lines.push(`- ${item.concept}${location}: ${item.question}`);
    }
  }

  lines.push("", "## Recent Concepts", "");
  if (concepts.length === 0) {
    lines.push("- No concepts tracked yet.");
  } else {
    for (const concept of concepts.slice(0, 10)) {
      lines.push(`- ${concept.name}: ${concept.count} time${concept.count === 1 ? "" : "s"}; confidence: ${concept.confidence}; last seen: ${concept.lastSeen}`);
    }
  }

  return lines;
}

function shortFileName(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

function getProvider(): AiProvider {
  return vscode.workspace.getConfiguration("codebuddy").get<AiProvider>("provider", "openai");
}

function getApiBaseUrl(provider: AiProvider, config: vscode.WorkspaceConfiguration): string {
  const configured = config.get<string>("apiBaseUrl", "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "local":
      return "http://localhost:11434/v1";
    case "openai":
    default:
      return "https://api.openai.com/v1";
  }
}

function getModel(provider: AiProvider, config: vscode.WorkspaceConfiguration): string {
  const configured = config.get<string>("model", "").trim();
  if (configured) {
    return configured;
  }

  switch (provider) {
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "openrouter":
      return "anthropic/claude-3.5-haiku";
    case "local":
      return "llama3.2";
    case "openai":
    default:
      return "gpt-4.1-mini";
  }
}

function todayKey(): string {
  return dateKey(new Date());
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getNonce() {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
