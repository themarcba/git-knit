import checkbox from "@inquirer/checkbox";

// Thin wrapper around the interactive multi-select. Space toggles, enter
// confirms. Kept separate so command logic stays testable with a stub selector.
export async function selectBranches(candidates: string[]): Promise<string[]> {
  return checkbox({
    message: "Select branches to add",
    choices: candidates.map((b) => ({ name: b, value: b })),
    loop: false,
  });
}
