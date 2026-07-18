import { createInterface } from "node:readline/promises";
import type { ConflictChoice } from "../commands/sync.js";

export function parseConflictChoice(input: string): ConflictChoice | null {
  const v = input.trim().toLowerCase();
  if (v === "r" || v === "resolve") return "resolve";
  if (v === "a" || v === "abort") return "abort";
  return null;
}

// A yes/no answer with a default-No policy: only an explicit y/yes counts as
// yes, everything else (including empty input) is no.
export function parseConfirm(input: string): boolean {
  const v = input.trim().toLowerCase();
  return v === "y" || v === "yes";
}

// Bound retries so a closed/EOF stdin (readline then resolves "" forever)
// falls back to the safe default instead of spinning indefinitely.
const MAX_ATTEMPTS = 3;

// A single yes/no prompt with a default of No. Non-interactive contexts can't
// prompt, so they answer No.
export function makeConfirmPrompt(interactive: boolean) {
  return async (question: string): Promise<boolean> => {
    if (!interactive) return false;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(`  ${question} [y/N] `);
      return parseConfirm(answer);
    } finally {
      rl.close();
    }
  };
}

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
