import type { Ctx } from "./context.js";
import { loadConfig } from "../config.js";

export function listCmd(ctx: Ctx): number {
  const cfg = loadConfig(ctx.configFile);
  const names = Object.keys(cfg.integrations);
  const { ui, glyphs: g, palette: p } = ctx;

  ui.plain("");
  ui.plain(`  ${p.bold("Integrations")}`);
  ui.plain("");
  if (names.length === 0) {
    ui.plain(`  ${p.dim("none defined — add one with git knit add <integration> <branch> --base <ref>")}`);
    ui.plain("");
    return 0;
  }
  const width = Math.max(...names.map((n) => n.length));
  for (const name of names) {
    const integ = cfg.integrations[name];
    const count = integ.depends_on.length;
    const noun = count === 1 ? "branch" : "branches";
    ui.plain(
      `  ${p.dim(g.bullet)} ${name.padEnd(width)}  ${p.dim("base")} ${integ.base}  ${p.dim(`${count} ${noun}`)}`,
    );
  }
  ui.plain("");
  return 0;
}
