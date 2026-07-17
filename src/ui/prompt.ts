import { createInterface } from "node:readline/promises";
import type { ConflictChoice } from "../commands/sync.js";

export function parseConflictChoice(input: string): ConflictChoice | null {
  const v = input.trim().toLowerCase();
  if (v === "r" || v === "resolve") return "resolve";
  if (v === "a" || v === "abort") return "abort";
  return null;
}

// Bound retries so a closed/EOF stdin (readline then resolves "" forever)
// falls back to the safe default instead of spinning indefinitely.
const MAX_ATTEMPTS = 3;

export function makeConflictPrompt(interactive: boolean) {
  return async (dep: string): Promise<ConflictChoice> => {
    if (!interactive) return "abort";
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const answer = await rl.question(
          `  Conflict merging ${dep}. [r]esolve manually or [a]bort? `,
        );
        const choice = parseConflictChoice(answer);
        if (choice) return choice;
      }
      // Give up on unparseable input and take the safe path.
      return "abort";
    } finally {
      rl.close();
    }
  };
}
