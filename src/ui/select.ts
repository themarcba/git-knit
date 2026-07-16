import checkbox from "@inquirer/checkbox";
import { emitKeypressEvents } from "node:readline";
import type { SetupChoice } from "../commands/edit.js";

const CANCEL_ERRORS = new Set(["AbortPromptError", "CancelPromptError", "ExitPromptError"]);

// Interactive multi-select. Space toggles, enter confirms, Esc cancels.
// Already-selected branches come in pre-checked. Returns null on cancel so the
// caller can exit without changing anything. Kept separate from command logic
// so that logic stays testable with a stub selector.
export async function selectBranches(choices: SetupChoice[]): Promise<string[] | null> {
  const controller = new AbortController();
  const stdin = process.stdin;
  emitKeypressEvents(stdin);
  const onKeypress = (_str: string, key: { name?: string } | undefined) => {
    if (key?.name === "escape") controller.abort();
  };
  stdin.on("keypress", onKeypress);

  try {
    return await checkbox(
      {
        message: "Select the branches to include (esc to cancel)",
        choices: choices.map((c) => ({ name: c.value, value: c.value, checked: c.checked })),
        loop: false,
      },
      { signal: controller.signal },
    );
  } catch (err) {
    if (err instanceof Error && CANCEL_ERRORS.has(err.name)) return null;
    throw err;
  } finally {
    stdin.removeListener("keypress", onKeypress);
  }
}
