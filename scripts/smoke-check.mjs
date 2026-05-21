import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("src/extension.ts", "utf8");

const requiredCommands = [
  "codebuddy.askLine",
  "codebuddy.hintLine",
  "codebuddy.fullSolutionLine",
  "codebuddy.reviewLater",
  "codebuddy.startDailyReview",
  "codebuddy.showMistakeTimeline",
  "codebuddy.clearInlineNotes"
];

const contributedCommands = new Set(packageJson.contributes.commands.map((command) => command.command));
const activationEvents = new Set(packageJson.activationEvents);

for (const command of requiredCommands) {
  assert(contributedCommands.has(command), `Missing contributed command: ${command}`);
  assert(activationEvents.has(`onCommand:${command}`), `Missing activation event: ${command}`);
}

assert(
  packageJson.contributes.keybindings.some((binding) => binding.command === "codebuddy.askLine" && binding.key === "ctrl+alt+b"),
  "Missing Ctrl+Alt+B quick ask keybinding"
);
assert(
  packageJson.contributes.keybindings.some((binding) => binding.command === "codebuddy.clearInlineNotes" && binding.key === "ctrl+alt+c"),
  "Missing Ctrl+Alt+C clear comments keybinding"
);

const requiredSourceMarkers = [
  "const REVIEW_ITEMS_KEY",
  "interface ReviewItem",
  "reviewLastExplanationLater",
  "startDailyReview",
  "showMistakeTimeline",
  "formatBuddyCommentBlock",
  "buildMistakeTimeline",
  "nextReviewDate",
  "workspaceState.update(REVIEW_ITEMS_KEY"
];

for (const marker of requiredSourceMarkers) {
  assert(source.includes(marker), `Missing source marker: ${marker}`);
}

assert(!source.includes("formatInlineComment("), "Old inline decoration formatter should not be used");
assert(!source.includes("inlineNotes = new Map"), "Old inline notes map should not be present");

console.log("Smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
