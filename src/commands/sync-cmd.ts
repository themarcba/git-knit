import type { Ctx } from "./context.js";
import { loadConfig } from "../config.js";
import { syncIntegration } from "./sync.js";
import { makeConflictPrompt } from "../ui/prompt.js";

export async function syncCmd(
  ctx: Ctx,
  integration: string | undefined,
  opts: { all?: boolean; force?: boolean },
): Promise<number> {
  const cfg = loadConfig(ctx.root);
  // Default to the branch you're on when no integration is named.
  const target = integration ?? ctx.git.currentBranch();
  const names = opts.all ? Object.keys(cfg.integrations) : [target];

  if (names.length === 0) {
    ctx.ui.fail("No integrations defined");
    return 1;
  }
  for (const name of names) {
    if (!cfg.integrations[name]) {
      ctx.ui.fail(`No integration "${name}"`);
      if (!integration && !opts.all) {
        ctx.ui.info("name an integration, check out its branch, or use --all");
      }
      return 1;
    }
  }

  const onConflict = makeConflictPrompt(ctx.interactive);
  let exit = 0;
  for (const name of names) {
    ctx.ui.info(`sync ${name}`);
    const res = await syncIntegration(ctx.git, name, cfg.integrations[name], {
      ui: ctx.ui,
      onConflict,
      force: opts.force,
    });
    if (res.status === "ok") continue;
    if (res.status === "conflict-resolve") {
      ctx.ui.info(`resolve the conflict, commit, then run: git knit sync ${name}`);
      return 1;
    }
    // conflict-aborted or error
    exit = 1;
  }
  return exit;
}
