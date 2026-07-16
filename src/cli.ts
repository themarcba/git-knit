#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createGit } from "./git.js";
import { repoRoot } from "./repo.js";
import { makeUi } from "./ui/spinner.js";
import { colorEnabled, palette } from "./ui/color.js";
import { glyphs } from "./ui/glyphs.js";
import type { Ctx } from "./commands/context.js";
import { initCmd } from "./commands/init.js";
import { addCmd, removeCmd } from "./commands/edit.js";
import { statusCmd } from "./commands/status.js";
import { listCmd } from "./commands/list.js";
import { syncCmd } from "./commands/sync-cmd.js";

// add/remove accept either `<branch>` (integration = current branch) or the
// explicit `<integration> <branch>` form.
function resolveTarget(
  ctx: Ctx,
  first: string,
  second: string | undefined,
): { integration: string; branch: string } {
  if (second === undefined) {
    return { integration: ctx.git.currentBranch(), branch: first };
  }
  return { integration: first, branch: second };
}

export async function run(argv: string[], cwd = process.cwd()): Promise<number> {
  const interactive = process.stdin.isTTY === true && !argv.includes("--no-interactive");
  const color = colorEnabled();
  const unicode = process.env.TERM !== "dumb";
  const ui = makeUi({ color, unicode, spinner: interactive });

  let root: string;
  try {
    root = repoRoot(cwd);
  } catch {
    ui.fail("Not a git repository");
    return 1;
  }

  const ctx: Ctx = {
    git: createGit(root),
    root,
    ui,
    glyphs: glyphs(unicode),
    palette: palette(color),
    interactive,
    debug: argv.includes("--debug"),
  };

  const program = new Command();
  program
    .name("git-assemble")
    .description("Compose independent branches into a rebuildable integration branch.")
    .option("--no-interactive", "never prompt; abort on conflict")
    .option("--debug", "print stack traces on error")
    .exitOverride()
    .configureOutput({
      writeErr: (str) => process.stderr.write(str),
      writeOut: (str) => process.stdout.write(str),
    });

  let code = 0;
  const guard = (fn: () => number | Promise<number>) => async () => {
    try {
      code = await fn();
    } catch (e: any) {
      if (ctx.debug) console.error(e);
      ui.fail(e?.message ?? String(e));
      code = 1;
    }
  };

  program
    .command("init")
    .argument("[integration]")
    .argument("[base]")
    .description("scaffold .assemble.json")
    .action((integration?: string, base?: string) =>
      guard(() => initCmd(ctx, integration, base))(),
    );

  program
    .command("add")
    .argument("<first>", "dependency branch, or integration when a second name is given")
    .argument("[second]", "dependency branch (with an explicit integration)")
    .option("--base <ref>", "base branch when creating a new integration")
    .description("add a dependency branch to an integration (defaults to the current branch)")
    .action((first: string, second: string | undefined, opts: { base?: string }) =>
      guard(() => {
        const { integration, branch } = resolveTarget(ctx, first, second);
        return addCmd(ctx, integration, branch, opts.base);
      })(),
    );

  program
    .command("remove")
    .argument("<first>", "dependency branch, or integration when a second name is given")
    .argument("[second]", "dependency branch (with an explicit integration)")
    .description("remove a dependency branch from an integration (defaults to the current branch)")
    .action((first: string, second: string | undefined) =>
      guard(() => {
        const { integration, branch } = resolveTarget(ctx, first, second);
        return removeCmd(ctx, integration, branch);
      })(),
    );

  program
    .command("sync")
    .argument("[integration]")
    .option("--all", "sync every integration")
    .option("--force", "overwrite an integration branch with manual commits")
    .description("rebuild the integration branch from base + dependencies")
    .action((integration: string | undefined, opts: { all?: boolean; force?: boolean }) =>
      guard(() => syncCmd(ctx, integration, opts))(),
    );

  program
    .command("status")
    .argument("[integration]")
    .description("show dependencies and whether a sync would change anything")
    .action((integration?: string) => guard(() => statusCmd(ctx, integration))());

  program
    .command("list")
    .description("list all integrations")
    .action(() => guard(() => listCmd(ctx))());

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e: any) {
    const c = e?.code;
    if (c === "commander.helpDisplayed" || c === "commander.help" || c === "commander.version") {
      return 0;
    }
    if (c === "commander.unknownCommand" || c === "commander.missingArgument" || c === "commander.excessArguments") {
      // commander already printed a message to stderr.
      return 1;
    }
    if (ctx.debug) console.error(e);
    ui.fail(e?.message ?? "Command failed");
    return 1;
  }
  return code;
}

// Only auto-run when invoked as a binary, not when imported by tests.
// Resolve real paths so this still fires through an npm-link symlink, where
// process.argv[1] is the symlink but import.meta.url is the real file.
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  run(process.argv.slice(2)).then((c) => process.exit(c));
}
