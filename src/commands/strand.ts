import type { Ctx } from "./context.js";
import type { Ui } from "../ui/spinner.js";
import { loadOrEmpty, writeConfig, addDependency } from "../config.js";
import { defaultBase } from "./edit.js";

export interface StrandOptions {
  ui: Ui;
  confirmCreateIntegration: (integration: string) => Promise<boolean>;
  from?: string;
}

export type StrandResult =
  | { status: "ok"; branch: string; integration: string; created: boolean; from: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function strand(
  ctx: Ctx,
  branch: string,
  opts: StrandOptions,
): Promise<StrandResult> {
  const integration = ctx.git.currentBranch();

  if (branch === integration) {
    return fail(opts, "The strand can't be the integration branch itself");
  }

  // Only uncommitted changes to *tracked* files are hazardous across the branch
  // switch; untracked files are carried over safely. (The knit config lives in
  // .git, so it never appears here.)
  const tracked = ctx.git.tryRun("status", "--porcelain", "--untracked-files=no");
  if (tracked.ok && tracked.stdout !== "") {
    return fail(opts, "You have uncommitted changes; commit or stash first");
  }

  if (ctx.git.branchExists(branch)) {
    return fail(opts, `branch "${branch}" already exists`);
  }

  const from = opts.from ?? defaultBase(ctx.git, integration);
  if (!from) {
    return fail(opts, "Could not determine a branch to strand from; pass --from <ref>");
  }
  if (!refExists(ctx.git, from)) {
    return fail(opts, `from ref "${from}" not found`);
  }

  const cfg = loadOrEmpty(ctx.configFile);
  const existing = cfg.integrations[integration];
  const created = !existing;

  let base: string | undefined;
  if (existing) {
    base = existing.base;
  } else {
    // The current branch isn't an integration yet. Adopting it needs a
    // confirmation we can only ask for interactively.
    if (!ctx.interactive) {
      return fail(
        opts,
        `"${integration}" is not a git-knit integration; create it first (e.g. git knit add) or run interactively`,
      );
    }
    opts.ui.warn(`"${integration}" is not a git-knit integration yet`);
    const ok = await opts.confirmCreateIntegration(integration);
    if (!ok) return { status: "cancelled" };
    base = defaultBase(ctx.git, integration);
    if (!base) {
      return fail(opts, `Could not determine a base for "${integration}"; add it with a base first`);
    }
  }

  // Compute (and validate) the config change before touching any branches.
  const next = addDependency(cfg, integration, branch, base);

  ctx.git.run("checkout", "-q", "-b", branch, from);
  writeConfig(ctx.configFile, next);

  return { status: "ok", branch, integration, created, from };
}

// Whether a ref (branch, tag, or commit) resolves — --from accepts any commit,
// not just local branches.
function refExists(git: Ctx["git"], ref: string): boolean {
  return git.tryRun("rev-parse", "--verify", "--quiet", `${ref}^{commit}`).ok;
}

function fail(opts: StrandOptions, message: string): StrandResult {
  opts.ui.fail(message);
  return { status: "error", message };
}
