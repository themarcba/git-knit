import type { Ctx } from "./context.js";
import { strand } from "./strand.js";
import { makeConfirmPrompt } from "../ui/prompt.js";

export async function strandCmd(
  ctx: Ctx,
  branch: string,
  opts: { from?: string },
): Promise<number> {
  const confirm = makeConfirmPrompt(ctx.interactive);
  const res = await strand(ctx, branch, {
    ui: ctx.ui,
    from: opts.from,
    confirmCreateIntegration: (integration) =>
      confirm(`Make "${integration}" a git-knit integration?`),
  });

  if (res.status === "error") return 1;
  if (res.status === "cancelled") {
    ctx.ui.info("cancelled");
    return 0;
  }

  if (res.created) {
    ctx.ui.info(`created integration "${res.integration}"`);
  }
  ctx.ui.ok(`stranded ${res.branch} off ${res.from}, added to ${res.integration}`);
  ctx.ui.info(`now on ${res.branch} — commit your work, then: git knit sync ${res.integration}`);
  return 0;
}
