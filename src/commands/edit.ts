import type { Ctx } from "./context.js";
import { loadConfig, writeConfig, addDependency, removeDependency } from "../config.js";

export function addCmd(
  ctx: Ctx,
  integration: string,
  branch: string,
  base?: string,
): number {
  const cfg = loadConfig(ctx.root);
  const isNew = !cfg.integrations[integration];
  const chosenBase = isNew ? (base ?? ctx.git.currentBranch()) : undefined;
  const next = addDependency(cfg, integration, branch, chosenBase);
  writeConfig(ctx.root, next);

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

// Branches worth offering interactively: everything except the integration
// branch itself, its base, and branches already declared as dependencies.
export function pickableBranches(
  all: string[],
  integration: string,
  base: string,
  existing: string[],
): string[] {
  const exclude = new Set<string>([integration, base, ...existing]);
  return all.filter((b) => !exclude.has(b));
}

export type BranchSelector = (candidates: string[]) => Promise<string[]>;

export async function addInteractive(
  ctx: Ctx,
  integration: string,
  select: BranchSelector,
): Promise<number> {
  const cfg = loadConfig(ctx.root);
  const integ = cfg.integrations[integration];
  if (!integ) {
    ctx.ui.fail(`No integration "${integration}"`);
    ctx.ui.info(`create it first: git knit init ${integration} <base>`);
    return 1;
  }

  const candidates = pickableBranches(
    ctx.git.branches(),
    integration,
    integ.base,
    integ.depends_on,
  );
  if (candidates.length === 0) {
    ctx.ui.info(`no branches available to add to ${integration}`);
    return 0;
  }

  const chosen = await select(candidates);
  if (chosen.length === 0) {
    ctx.ui.info("nothing selected");
    return 0;
  }

  let next = cfg;
  for (const branch of chosen) {
    next = addDependency(next, integration, branch);
  }
  writeConfig(ctx.root, next);
  for (const branch of chosen) {
    ctx.ui.info(`added ${branch} to ${integration}`);
  }
  ctx.ui.info(`next: git knit sync ${integration}`);
  return 0;
}

export function removeCmd(ctx: Ctx, integration: string, branch: string): number {
  const cfg = loadConfig(ctx.root);
  const next = removeDependency(cfg, integration, branch);
  writeConfig(ctx.root, next);
  ctx.ui.info(`removed ${branch} from ${integration}`);
  return 0;
}
