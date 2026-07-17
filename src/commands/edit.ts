import type { Ctx } from "./context.js";
import type { Git } from "../git.js";
import { loadOrEmpty, writeConfig, addDependency, removeDependency } from "../config.js";

// A sensible base for a newly-created integration: the repo's mainline branch,
// never the integration branch itself. Undefined when it can't be guessed.
export function defaultBase(git: Git, integration: string): string | undefined {
  for (const candidate of ["main", "master"]) {
    if (candidate !== integration && git.branchExists(candidate)) return candidate;
  }
  return undefined;
}

export function addCmd(
  ctx: Ctx,
  integration: string,
  branch: string,
  base?: string,
): number {
  const cfg = loadOrEmpty(ctx.configFile);
  const isNew = !cfg.integrations[integration];

  let chosenBase: string | undefined;
  if (isNew) {
    chosenBase = base ?? defaultBase(ctx.git, integration);
    if (!chosenBase) {
      ctx.ui.fail(`Could not determine a base for "${integration}"; pass --base <ref>`);
      return 1;
    }
  }

  const next = addDependency(cfg, integration, branch, chosenBase);
  writeConfig(ctx.configFile, next);

  if (!ctx.git.branchExists(branch)) {
    ctx.ui.warn(`branch "${branch}" does not exist locally yet`);
  }
  if (isNew) {
    ctx.ui.info(`created integration "${integration}" (base ${next.integrations[integration].base})`);
  }
  ctx.ui.info(`added ${branch} to ${integration}`);
  ctx.ui.info(`next: git knit sync ${integration}`);
  return 0;
}

export function removeCmd(ctx: Ctx, integration: string, branch: string): number {
  const cfg = loadOrEmpty(ctx.configFile);
  const next = removeDependency(cfg, integration, branch);
  writeConfig(ctx.configFile, next);
  ctx.ui.info(`removed ${branch} from ${integration}`);
  return 0;
}

// ---- interactive configure -----------------------------------------------------

export interface SetupChoice {
  value: string;
  checked: boolean;
  disabled?: string | boolean;
}

// Returns null when the user cancels (e.g. presses Esc) rather than confirming.
export type ChoiceSelector = (choices: SetupChoice[]) => Promise<string[] | null>;

// The branches to offer for an integration. The base is pinned first as a
// disabled "(base)" entry — shown for context but not selectable. Then the
// current dependencies (checked, in dependency/merge order), then every other
// local branch (unchecked, alphabetical). The integration branch, the branch
// you're on, and the base are never selectable. Existing dependencies are
// included even if their branch no longer exists locally, so they can still be
// deselected (removed).
export function buildSetupChoices(
  all: string[],
  integration: string,
  current: string,
  base: string,
  existing: string[],
): SetupChoice[] {
  const exclude = new Set<string>([integration, current, base]);
  const existingSet = new Set(existing);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const dep of existing) {
    if (!exclude.has(dep) && !seen.has(dep)) {
      ordered.push(dep);
      seen.add(dep);
    }
  }
  for (const branch of all) {
    if (!exclude.has(branch) && !seen.has(branch)) {
      ordered.push(branch);
      seen.add(branch);
    }
  }

  const base_entry: SetupChoice = { value: base, checked: false, disabled: "(base)" };
  const selectable = ordered.map((value) => ({ value, checked: existingSet.has(value) }));
  return [base_entry, ...selectable];
}

// Reconcile the dependency list to the user's selection: keep still-selected
// existing deps in their original order, then append newly-selected ones.
export function reconcileDeps(existing: string[], selected: string[]): string[] {
  const sel = new Set(selected);
  const existingSet = new Set(existing);
  const kept = existing.filter((d) => sel.has(d));
  const added = selected.filter((s) => !existingSet.has(s));
  return [...kept, ...added];
}

export async function configureInteractive(
  ctx: Ctx,
  integration: string,
  select: ChoiceSelector,
  base?: string,
): Promise<number> {
  const cfg = loadOrEmpty(ctx.configFile);
  const existing = cfg.integrations[integration];

  // Determine the base — from the existing integration, or a guess when new.
  let resolvedBase: string;
  if (existing) {
    resolvedBase = existing.base;
  } else {
    const guessed = base ?? defaultBase(ctx.git, integration);
    if (!guessed) {
      ctx.ui.fail(`Could not determine a base for "${integration}"; pass --base <ref>`);
      return 1;
    }
    resolvedBase = guessed;
  }

  const currentDeps = existing?.depends_on ?? [];
  const choices = buildSetupChoices(
    ctx.git.branches(),
    integration,
    ctx.git.currentBranch(),
    resolvedBase,
    currentDeps,
  );
  // The base is always present but disabled; require at least one selectable.
  if (choices.every((c) => c.disabled)) {
    ctx.ui.info(`no branches available for ${integration}`);
    return 0;
  }

  const selected = await select(choices);
  if (selected === null) {
    ctx.ui.info("cancelled");
    return 0;
  }
  const nextDeps = reconcileDeps(currentDeps, selected);
  const added = nextDeps.filter((d) => !currentDeps.includes(d));
  const removed = currentDeps.filter((d) => !nextDeps.includes(d));

  if (!existing && nextDeps.length === 0) {
    ctx.ui.info("nothing selected");
    return 0;
  }
  if (existing && added.length === 0 && removed.length === 0) {
    ctx.ui.info("no changes");
    return 0;
  }

  const next = {
    integrations: {
      ...cfg.integrations,
      [integration]: { base: resolvedBase, depends_on: nextDeps },
    },
  };
  writeConfig(ctx.configFile, next);

  if (!existing) {
    ctx.ui.info(`created integration "${integration}" (base ${resolvedBase})`);
  }
  for (const branch of added) ctx.ui.info(`added ${branch} to ${integration}`);
  for (const branch of removed) ctx.ui.info(`removed ${branch} from ${integration}`);
  ctx.ui.info(`next: git knit sync ${integration}`);
  return 0;
}
