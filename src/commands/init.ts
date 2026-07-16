import type { Ctx } from "./context.js";
import { CONFIG_BASENAME, configExists, emptyConfig, writeConfig } from "../config.js";

export function initCmd(
  ctx: Ctx,
  integration?: string,
  base?: string,
): number {
  if (configExists(ctx.configFile)) {
    ctx.ui.warn(`knit config already exists (.git/${CONFIG_BASENAME})`);
    return 1;
  }
  const cfg = emptyConfig();
  if (integration) {
    const chosenBase = base ?? ctx.git.currentBranch();
    cfg.integrations[integration] = { base: chosenBase, depends_on: [] };
    writeConfig(ctx.configFile, cfg);
    ctx.ui.info(`created .git/${CONFIG_BASENAME} with integration "${integration}" (base ${chosenBase})`);
    ctx.ui.info(`next: git knit add ${integration} <branch>`);
  } else {
    writeConfig(ctx.configFile, cfg);
    ctx.ui.info(`created .git/${CONFIG_BASENAME}`);
    ctx.ui.info(`next: git knit add <integration> <branch> --base <ref>`);
  }
  return 0;
}
