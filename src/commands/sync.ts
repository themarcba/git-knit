import type { Git } from "../git.js";
import { CONFIG_FILENAME, type Integration } from "../config.js";

export type ConflictChoice = "resolve" | "abort";

export interface SyncUi {
  step: (msg: string) => void;
  ok: (msg: string) => void;
  fail: (msg: string) => void;
  info: (msg: string) => void;
}

export interface SyncOptions {
  ui: SyncUi;
  onConflict: (dep: string) => Promise<ConflictChoice>;
  force?: boolean;
}

export type SyncResult =
  | { status: "ok"; merged: string[] }
  | { status: "conflict-aborted"; dep: string }
  | { status: "conflict-resolve"; dep: string }
  | { status: "error"; message: string };

export async function syncIntegration(
  git: Git,
  name: string,
  integ: Integration,
  opts: SyncOptions,
): Promise<SyncResult> {
  // Preconditions. Only uncommitted changes to *tracked* files are hazardous
  // across the branch switch + merge; untracked files are carried over safely.
  // The config file itself is exempt (excluded via pathspec): it is read into
  // memory here and edited by add/remove, so an uncommitted config should not
  // block a sync.
  const tracked = git.tryRun(
    "status",
    "--porcelain",
    "--untracked-files=no",
    "--",
    ".",
    `:(exclude)${CONFIG_FILENAME}`,
  );
  if (tracked.ok && tracked.stdout !== "") {
    return fail(opts, "You have uncommitted changes; commit or stash first");
  }
  if (!git.branchExists(integ.base)) return fail(opts, `Base branch "${integ.base}" not found`);
  const missing = integ.depends_on.filter((b) => !git.branchExists(b));
  if (missing.length) return fail(opts, `Missing dependency branches: ${missing.join(", ")}`);

  const preExists = git.branchExists(name);
  const snapshot = preExists ? git.revParse(name) : null;

  // Stray-commit guard: any commit on the integration branch not contained in
  // base or the dependencies is manual work we would silently destroy.
  if (preExists && !opts.force) {
    const stray = git.tryRun("rev-list", name, "--not", integ.base, ...integ.depends_on);
    if (stray.ok && stray.stdout !== "") {
      return fail(
        opts,
        `"${name}" has commits not from its base or dependencies; re-run with --force to overwrite`,
      );
    }
  }

  opts.ui.step(`rebuilding ${name} from ${integ.base}`);
  git.run("checkout", "-q", "-B", name, integ.base);
  opts.ui.ok(`reset to ${integ.base}`);

  const merged: string[] = [];
  for (const dep of integ.depends_on) {
    opts.ui.step(`merging ${dep}`);
    const r = git.tryRun("merge", "--no-ff", "-m", `assemble: merge ${dep}`, dep);
    if (r.ok) {
      opts.ui.ok(`merged ${dep}`);
      merged.push(dep);
      continue;
    }
    opts.ui.fail(`merging ${dep} — conflict`);
    const choice = await opts.onConflict(dep);
    if (choice === "resolve") {
      return { status: "conflict-resolve", dep };
    }
    restore(git, name, integ.base, snapshot);
    return { status: "conflict-aborted", dep };
  }
  opts.ui.ok(`${name} assembled (${merged.length} ${merged.length === 1 ? "branch" : "branches"})`);
  return { status: "ok", merged };
}

function restore(git: Git, name: string, base: string, snapshot: string | null): void {
  git.tryRun("merge", "--abort");
  if (snapshot) {
    // Reset the branch back to exactly where it was before the sync.
    git.run("checkout", "-q", "-B", name, snapshot);
  } else {
    // The branch did not exist before this sync — leave it as if untouched.
    git.run("checkout", "-q", base);
    git.tryRun("branch", "-D", name);
  }
}

function fail(opts: SyncOptions, message: string): SyncResult {
  opts.ui.fail(message);
  return { status: "error", message };
}
