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
  ctx.ui.info(`next: git assemble sync ${integration}`);
  return 0;
}

export function removeCmd(ctx: Ctx, integration: string, branch: string): number {
  const cfg = loadConfig(ctx.root);
  const next = removeDependency(cfg, integration, branch);
  writeConfig(ctx.root, next);
  ctx.ui.info(`removed ${branch} from ${integration}`);
  return 0;
}
