import checkbox from "@inquirer/checkbox";
import type { SetupChoice } from "../commands/edit.js";

// Thin wrapper around the interactive multi-select. Space toggles, enter
// confirms. Already-selected branches come in pre-checked. Kept separate so
// command logic stays testable with a stub selector.
export async function selectBranches(choices: SetupChoice[]): Promise<string[]> {
  return checkbox({
    message: "Select the branches to include",
    choices: choices.map((c) => ({ name: c.value, value: c.value, checked: c.checked })),
    loop: false,
  });
}
