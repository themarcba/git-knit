import { createInterface } from "node:readline/promises";
import type { ConflictChoice } from "../commands/sync.js";

export function parseConflictChoice(input: string): ConflictChoice | null {
  const v = input.trim().toLowerCase();
  if (v === "r" || v === "resolve") return "resolve";
  if (v === "a" || v === "abort") return "abort";
  return null;
}

export function makeConflictPrompt(interactive: boolean) {
  return async (dep: string): Promise<ConflictChoice> => {
    if (!interactive) return "abort";
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (;;) {
        const answer = await rl.question(
          `  Conflict merging ${dep}. [r]esolve manually or [a]bort? `,
        );
        const choice = parseConflictChoice(answer);
        if (choice) return choice;
      }
    } finally {
      rl.close();
    }
  };
}
