(function () {
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById("messages");
  const context = document.getElementById("context");
  const concepts = document.getElementById("concepts");
  const learningDebt = document.getElementById("learningDebt");
  const mistakes = document.getElementById("mistakes");
  const streak = document.getElementById("streak");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const setApiKey = document.getElementById("setApiKey");
  const clearChat = document.getElementById("clearChat");
  const explainSelection = document.getElementById("explainSelection");
  const checkThinking = document.getElementById("checkThinking");
  const reviewConcept = document.getElementById("reviewConcept");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));

  let mode = "explain";
  let streamNode = null;
  let streamBody = null;

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      modeButtons.forEach((item) => item.classList.toggle("active", item === button));
      input.focus();
    });
  });

  send.addEventListener("click", sendQuestion);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      sendQuestion();
    }
  });

  setApiKey.addEventListener("click", () => {
    const apiKey = window.prompt("Paste your provider API key");
    if (apiKey) {
      vscode.postMessage({ type: "setApiKey", apiKey });
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
      renderStatus("Write your understanding first, then I can check your mental model.");
      input.focus();
      return;
    }

    vscode.postMessage({ type: "checkThinking", text });
    input.value = "";
    input.focus();
  });

  reviewConcept.addEventListener("click", () => {
    const firstConcept = concepts.querySelector("[data-concept]");
    vscode.postMessage({
      type: "reviewConcept",
      concept: firstConcept ? firstConcept.dataset.concept : undefined
    });
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
      renderLearningState(message);
    }

    if (message.type === "context") {
      renderContext(message.context);
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
      renderStatus("Add an API key to start chatting.");
      scrollToBottom();
    }
  });

  function sendQuestion() {
    const text = input.value.trim();
    if (!text) {
      return;
    }

    vscode.postMessage({ type: "ask", text, mode });
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
    if (streamNode) {
      renderConfidenceControls(streamNode);
    }
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
    return node;
  }

  function renderContext(details) {
    const source = details.source === "selection" ? "selection" : details.source === "file" ? "active file" : "none";
    const language = details.languageId || "unknown";
    const conceptsText = details.concepts.length ? ` Concepts: ${details.concepts.join(", ")}.` : "";
    const mistakesText = details.mistakes && details.mistakes.length ? ` Patterns: ${details.mistakes.join(", ")}.` : "";
    const pythonNote = details.pythonFocused ? "" : " Optimized for Python; treating this as plain code context.";
    context.textContent = `Context sent: ${source}, ${language}, ${details.characterCount} chars via ${details.provider}/${details.model}.${conceptsText}${mistakesText}${pythonNote}`;
  }

  function renderLearningState(state) {
    const count = state.streak && state.streak.current ? state.streak.current : 0;
    streak.textContent = count > 0 ? `${count}-day learning streak` : "Python-first tutor";
    concepts.innerHTML = "";

    if (!state.concepts || state.concepts.length === 0) {
      const empty = document.createElement("span");
      empty.className = "concept muted";
      empty.textContent = "No concepts yet";
      concepts.append(empty);
      renderMemoryList(learningDebt, state.learningDebt, "No debt yet");
      renderMistakes(state.mistakes || []);
      return;
    }

    state.concepts.forEach((item) => {
      const chip = document.createElement("button");
      chip.className = item.reviewed ? "concept reviewed" : "concept";
      chip.dataset.concept = item.name;
      chip.title = `${item.reviewed ? "Reviewed" : "Waiting for review"} - confidence: ${item.confidence || "unknown"}`;
      chip.textContent = item.name;
      chip.addEventListener("click", () => {
        vscode.postMessage({ type: "reviewConcept", concept: item.name });
      });
      concepts.append(chip);
    });

    renderMemoryList(learningDebt, state.learningDebt, "No debt yet");
    renderMistakes(state.mistakes || []);
  }

  function renderMemoryList(container, items, emptyText) {
    container.innerHTML = "";
    if (!items || items.length === 0) {
      const empty = document.createElement("span");
      empty.className = "memory-item muted";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }

    items.forEach((item) => {
      const node = document.createElement("span");
      node.className = "memory-item";
      node.textContent = item;
      container.append(node);
    });
  }

  function renderMistakes(items) {
    mistakes.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("span");
      empty.className = "memory-item muted";
      empty.textContent = "No repeated mistakes";
      mistakes.append(empty);
      return;
    }

    items.forEach((item) => {
      const node = document.createElement("span");
      node.className = "memory-item";
      node.textContent = `${item.pattern} ${item.count}x`;
      mistakes.append(node);
    });
  }

  function renderConfidenceControls(article) {
    const controls = document.createElement("div");
    controls.className = "confidence";
    controls.innerHTML = "<span>Did this click?</span>";

    [
      ["low", "Not yet"],
      ["medium", "Mostly"],
      ["high", "Got it"]
    ].forEach(([value, label]) => {
      const button = document.createElement("button");
      button.className = "confidence-button";
      button.textContent = label;
      button.addEventListener("click", () => {
        vscode.postMessage({ type: "confidence", confidence: value });
        controls.remove();
      });
      controls.append(button);
    });

    article.append(controls);
  }

  function renderEmptyState() {
    if (messages.children.length > 0) {
      return;
    }

    const empty = document.createElement("div");
    empty.className = "empty";
    empty.dataset.empty = "true";
    empty.innerHTML = "<strong>Ask me anything while you code.</strong><span>I will explain first, hint before solving, and track concepts you are practicing.</span>";
    messages.append(empty);
  }

  function removeEmptyState() {
    const empty = messages.querySelector("[data-empty='true']");
    if (empty) {
      empty.remove();
    }
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  renderLearningState({ concepts: [], mistakes: [], learningDebt: [], streak: { current: 0 } });
  renderEmptyState();
}());
