import type { Ctx } from "./context.js";
import { loadConfig } from "../config.js";
import { computeDrift, type Drift } from "../drift.js";

export function statusCmd(ctx: Ctx, integration?: string): number {
  const cfg = loadConfig(ctx.root);

  if (integration && !cfg.integrations[integration]) {
    ctx.ui.fail(`No integration "${integration}"`);
    return 1;
  }

  // No name given: show the current branch's integration if it is one,
  // otherwise fall back to showing them all.
  let names: string[];
  if (integration) {
    names = [integration];
  } else {
    const current = ctx.git.currentBranch();
    names = cfg.integrations[current] ? [current] : Object.keys(cfg.integrations);
  }

  if (names.length === 0) {
    ctx.ui.info("no integrations defined");
    return 0;
  }

  for (const name of names) {
    renderOne(ctx, name, computeDrift(ctx.git, name, cfg.integrations[name]), cfg.integrations[name].base);
  }
  return 0;
}

function renderOne(ctx: Ctx, name: string, d: Drift, base: string): void {
  const { ui, glyphs: g, palette: p } = ctx;
  ui.plain("");

  const header = !d.assembled
    ? p.warning("not assembled")
    : d.upToDate
      ? p.success("up to date")
      : p.warning("out of date");
  ui.plain(`  ${p.bold(name)}   ${p.dim(g.arrow)} ${header}`);
  ui.plain("");

  // Base row.
  const baseMark = !d.assembled
    ? p.dim(g.bullet)
    : d.baseCurrent
      ? p.success(g.success)
      : p.warning(g.ahead);
  const baseNote = !d.assembled ? "" : d.baseCurrent ? p.dim("current") : p.warning("base moved");
  ui.plain(`    ${baseMark} ${p.dim("base")}   ${base.padEnd(16)} ${baseNote}`);

  // Dependency rows.
  const width = Math.max(16, ...d.dependencies.map((x) => x.branch.length));
  for (const dep of d.dependencies) {
    let mark: string;
    let note: string;
    if (!dep.exists) {
      mark = p.failure(g.failure);
      note = p.failure("missing");
    } else if (!d.assembled) {
      mark = p.dim(g.bullet);
      note = p.dim("not assembled");
    } else if (dep.merged) {
      mark = p.success(g.success);
      note = p.dim("merged");
    } else {
      mark = p.warning(g.ahead);
      note = p.warning("new commits");
    }
    ui.plain(`    ${mark} ${dep.branch.padEnd(width + 5)} ${note}`);
  }

  if (d.assembled && !d.upToDate) {
    ui.plain("");
    ui.plain(`    ${p.dim(`run: git assemble sync ${name}`)}`);
  }
  ui.plain("");
}
