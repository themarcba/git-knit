import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { glyphs } from "../src/ui/glyphs.js";
import { palette } from "../src/ui/color.js";
import { makeUi } from "../src/ui/spinner.js";
import type { Ctx } from "../src/commands/context.js";
import { buildSetupChoices, reconcileDeps, configureInteractive } from "../src/commands/edit.js";
import { writeConfig, loadConfig } from "../src/config.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

function ctxFor(repo: TempRepo): Ctx {
  return {
    git: createGit(repo.dir),
    root: repo.dir,
    configFile: repo.configPath,
    ui: makeUi({ color: false, unicode: true, spinner: false }),
    glyphs: glyphs(true),
    palette: palette(false),
    interactive: true,
    debug: false,
  };
}

describe("buildSetupChoices", () => {
  it("pins the base first (disabled), then existing deps, then other branches", () => {
    const all = ["big-feature", "cleanup-c", "fix-a", "fix-b", "main"];
    // current branch = big-feature (the integration); base = main
    const choices = buildSetupChoices(all, "big-feature", "big-feature", "main", ["fix-b"]);
    expect(choices).toEqual([
      { value: "main", checked: false, disabled: "(base)" },
      { value: "fix-b", checked: true },
      { value: "cleanup-c", checked: false },
      { value: "fix-a", checked: false },
    ]);
  });

  it("excludes the integration, the current branch, and the base from selection", () => {
    const all = ["main", "other", "fix-a", "trunk"];
    // editing "other" while on main, base = trunk
    const choices = buildSetupChoices(all, "other", "main", "trunk", []);
    expect(choices).toEqual([
      { value: "trunk", checked: false, disabled: "(base)" },
      { value: "fix-a", checked: false },
    ]);
  });

  it("keeps an existing dep even if its branch no longer exists locally", () => {
    const all = ["main", "big-feature", "fix-a"];
    const choices = buildSetupChoices(all, "big-feature", "big-feature", "main", ["gone"]);
    expect(choices).toContainEqual({ value: "gone", checked: true });
  });
});

describe("reconcileDeps", () => {
  it("keeps still-selected deps in order and appends new ones", () => {
    expect(reconcileDeps(["a", "b", "c"], ["c", "a", "d"])).toEqual(["a", "c", "d"]);
  });
  it("drops deselected deps", () => {
    expect(reconcileDeps(["a", "b"], ["a"])).toEqual(["a"]);
  });
});

describe("configureInteractive", () => {
  it("adds newly checked and removes unchecked branches", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    repo.git("branch", "fix-b");
    repo.git("branch", "cleanup-c");
    writeConfig(repo.configPath, {
      integrations: { "big-feature": { base: "main", depends_on: ["fix-a"] } },
    });

    const ctx = ctxFor(repo);
    const select = async (choices: { value: string; checked: boolean }[]) => {
      // fix-a is pre-checked; drop it and pick fix-b instead
      expect(choices).toContainEqual({ value: "fix-a", checked: true });
      return ["fix-b"];
    };
    const code = await configureInteractive(ctx, "big-feature", select);
    expect(code).toBe(0);
    expect(loadConfig(repo.configPath).integrations["big-feature"].depends_on).toEqual(["fix-b"]);
  });

  it("reports no changes when the selection matches the current deps", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    writeConfig(repo.configPath, {
      integrations: { "big-feature": { base: "main", depends_on: ["fix-a"] } },
    });
    const code = await configureInteractive(ctxFor(repo), "big-feature", async () => ["fix-a"]);
    expect(code).toBe(0);
    expect(loadConfig(repo.configPath).integrations["big-feature"].depends_on).toEqual(["fix-a"]);
  });

  it("creates the integration on demand (base defaults to main)", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("branch", "fix-a");
    // no config exists yet
    const code = await configureInteractive(ctxFor(repo), "big-feature", async () => ["fix-a"]);
    expect(code).toBe(0);
    const cfg = loadConfig(repo.configPath);
    expect(cfg.integrations["big-feature"].base).toBe("main");
    expect(cfg.integrations["big-feature"].depends_on).toEqual(["fix-a"]);
  });

  it("makes no changes when the user cancels (selector returns null)", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    writeConfig(repo.configPath, {
      integrations: { "big-feature": { base: "main", depends_on: ["fix-a"] } },
    });
    const code = await configureInteractive(ctxFor(repo), "big-feature", async () => null);
    expect(code).toBe(0);
    expect(loadConfig(repo.configPath).integrations["big-feature"].depends_on).toEqual(["fix-a"]);
  });

  it("clears all deps when nothing is selected", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    writeConfig(repo.configPath, {
      integrations: { "big-feature": { base: "main", depends_on: ["fix-a"] } },
    });
    const code = await configureInteractive(ctxFor(repo), "big-feature", async () => []);
    expect(code).toBe(0);
    expect(loadConfig(repo.configPath).integrations["big-feature"].depends_on).toEqual([]);
  });
});
