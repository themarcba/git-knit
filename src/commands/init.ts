import type { Ctx } from "./context.js";
import { CONFIG_FILENAME, configExists, emptyConfig, writeConfig } from "../config.js";

export function initCmd(
  ctx: Ctx,
  integration?: string,
  base?: string,
): number {
  if (configExists(ctx.root)) {
    ctx.ui.warn(`${CONFIG_FILENAME} already exists`);
    return 1;
  }
  const cfg = emptyConfig();
  if (integration) {
    const chosenBase = base ?? ctx.git.currentBranch();
    cfg.integrations[integration] = { base: chosenBase, depends_on: [] };
    writeConfig(ctx.root, cfg);
    ctx.ui.info(`created ${CONFIG_FILENAME} with integration "${integration}" (base ${chosenBase})`);
    ctx.ui.info(`next: git knit add ${integration} <branch>`);
  } else {
    writeConfig(ctx.root, cfg);
    ctx.ui.info(`created ${CONFIG_FILENAME}`);
    ctx.ui.info(`next: git knit add <integration> <branch> --base <ref>`);
  }
  return 0;
}
