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
  const names = opts.all ? Object.keys(cfg.integrations) : integration ? [integration] : [];

  if (names.length === 0) {
    ctx.ui.fail("Specify an integration to sync, or use --all");
    return 1;
  }
  for (const name of names) {
    if (!cfg.integrations[name]) {
      ctx.ui.fail(`No integration "${name}"`);
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
      ctx.ui.info(`resolve the conflict, commit, then run: git assemble sync ${name}`);
      return 1;
    }
    // conflict-aborted or error
    exit = 1;
  }
  return exit;
}
