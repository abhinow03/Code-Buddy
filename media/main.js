(function () {
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById("messages");
  const fileStatus = document.getElementById("fileStatus");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const clearChat = document.getElementById("clearChat");
  const explainSelection = document.getElementById("explainSelection");
  const checkThinking = document.getElementById("checkThinking");

  let streamNode = null;
  let streamBody = null;

  send.addEventListener("click", sendQuestion);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  });

  clearChat.addEventListener("click", () => {
    vscode.postMessage({ type: "clearChat" });
  });

  explainSelection.addEventListener("click", () => {
    vscode.postMessage({ type: "explainSelection" });
  });

  checkThinking.addEventListener("click", () => {
    const text = input.value.trim();
    if (!text) {
      renderStatus("Write what you think is happening, then tap Thinking.");
      input.focus();
      return;
    }

    vscode.postMessage({ type: "checkThinking", text });
    input.value = "";
    input.focus();
  });

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message.type === "hydrate") {
      messages.innerHTML = "";
      message.history.forEach(renderMessage);
      renderEmptyState();
      scrollToBottom();
    }

    if (message.type === "learningState") {
      renderFileState(message);
    }

    if (message.type === "context") {
      renderContextState(message.context);
    }

    if (message.type === "message") {
      renderMessage(message.message);
      scrollToBottom();
    }

    if (message.type === "streamStart") {
      startAssistantStream();
      scrollToBottom();
    }

    if (message.type === "streamDelta") {
      appendAssistantStream(message.text);
      scrollToBottom();
    }

    if (message.type === "streamDone") {
      finishAssistantStream();
      scrollToBottom();
    }

    if (message.type === "status") {
      renderStatus(message.text);
      scrollToBottom();
    }

    if (message.type === "error") {
      finishAssistantStream();
      renderStatus(message.error, true);
      scrollToBottom();
    }

    if (message.type === "needsApiKey") {
      renderStatus("Run CodeBuddy: Set API Key from the Command Palette.");
      scrollToBottom();
    }
  });

  function sendQuestion() {
    const text = input.value.trim();
    if (!text) {
      return;
    }

    vscode.postMessage({ type: "ask", text, mode: "explain" });
    input.value = "";
    input.focus();
  }

  function renderMessage(message) {
    removeEmptyState();
    const article = createMessageNode(message.role);
    article.querySelector(".message-body").textContent = message.content;
    messages.append(article);
  }

  function startAssistantStream() {
    removeEmptyState();
    finishAssistantStream();
    streamNode = createMessageNode("assistant");
    streamBody = streamNode.querySelector(".message-body");
    streamBody.textContent = "";
    messages.append(streamNode);
  }

  function appendAssistantStream(text) {
    if (!streamBody) {
      startAssistantStream();
    }
    streamBody.textContent += text;
  }

  function finishAssistantStream() {
    streamNode = null;
    streamBody = null;
  }

  function createMessageNode(role) {
    const article = document.createElement("article");
    article.className = `message ${role}`;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "You" : "CodeBuddy";

    const body = document.createElement("div");
    body.className = "message-body";

    article.append(label, body);
    return article;
  }

  function renderStatus(text, isError) {
    removeEmptyState();
    const node = document.createElement("div");
    node.className = isError ? "status error" : "status";
    node.textContent = text;
    messages.append(node);
  }

  function renderFileState(state) {
    if (!state.fileName) {
      fileStatus.textContent = "Click a code file, then ask me";
      return;
    }

    fileStatus.textContent = `Reading ${shortName(state.fileName)}${state.languageId ? ` (${state.languageId})` : ""}`;
  }

  function renderContextState(details) {
    if (details.source === "none") {
      fileStatus.textContent = "No file attached";
      return;
    }

    const source = details.source === "selection" ? "selection" : "current file";
    fileStatus.textContent = `Reading ${source} - ${details.characterCount} chars`;
  }

  function renderEmptyState() {
    if (messages.children.length > 0) {
      return;
    }

    const empty = document.createElement("div");
    empty.className = "empty";
    empty.dataset.empty = "true";
    empty.innerHTML = "<strong>Hey, I am here.</strong><span>Ask naturally. I can read the file you were just editing.</span>";
    messages.append(empty);
  }

  function removeEmptyState() {
    const empty = messages.querySelector("[data-empty='true']");
    if (empty) {
      empty.remove();
    }
  }

  function shortName(path) {
    return path.split(/[\\/]/).pop() || path;
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  renderEmptyState();
}());
