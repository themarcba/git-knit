import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { glyphs } from "../src/ui/glyphs.js";
import { palette } from "../src/ui/color.js";
import { makeUi } from "../src/ui/spinner.js";
import type { Ctx } from "../src/commands/context.js";
import { pickableBranches, addInteractive } from "../src/commands/edit.js";
import { emptyConfig, writeConfig, loadConfig } from "../src/config.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

function ctxFor(repo: TempRepo): Ctx {
  return {
    git: createGit(repo.dir),
    root: repo.dir,
    ui: makeUi({ color: false, unicode: true, spinner: false }),
    glyphs: glyphs(true),
    palette: palette(false),
    interactive: true,
    debug: false,
  };
}

describe("pickableBranches", () => {
  it("excludes the integration, its base, and existing deps", () => {
    const all = ["main", "big-feature", "fix-a", "fix-b", "cleanup-c"];
    const result = pickableBranches(all, "big-feature", "main", ["fix-a"]);
    expect(result).toEqual(["fix-b", "cleanup-c"]);
  });

  it("returns everything else when nothing is excluded yet", () => {
    const all = ["main", "big-feature", "fix-a"];
    expect(pickableBranches(all, "big-feature", "main", [])).toEqual(["fix-a"]);
  });
});

describe("addInteractive", () => {
  it("adds every selected branch to the integration", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    repo.git("branch", "fix-b");
    repo.git("branch", "cleanup-c");
    writeConfig(repo.dir, {
      integrations: { "big-feature": { base: "main", depends_on: [] } },
    });

    const ctx = ctxFor(repo);
    const select = async (candidates: string[]) => {
      // git returns branches alphabetically
      expect(candidates).toEqual(["cleanup-c", "fix-a", "fix-b"]);
      return ["fix-a", "cleanup-c"];
    };
    const code = await addInteractive(ctx, "big-feature", select);
    expect(code).toBe(0);
    expect(loadConfig(repo.dir).integrations["big-feature"].depends_on).toEqual([
      "fix-a",
      "cleanup-c",
    ]);
  });

  it("does nothing when the selection is empty", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    writeConfig(repo.dir, {
      integrations: { "big-feature": { base: "main", depends_on: [] } },
    });
    const code = await addInteractive(ctxFor(repo), "big-feature", async () => []);
    expect(code).toBe(0);
    expect(loadConfig(repo.dir).integrations["big-feature"].depends_on).toEqual([]);
  });

  it("errors when the integration is not defined", async () => {
    repo = makeRepo();
    writeConfig(repo.dir, emptyConfig());
    let asked = false;
    const code = await addInteractive(ctxFor(repo), "ghost", async () => {
      asked = true;
      return [];
    });
    expect(code).toBe(1);
    expect(asked).toBe(false);
  });

  it("reports when there are no candidate branches", async () => {
    repo = makeRepo();
    writeConfig(repo.dir, {
      integrations: { "big-feature": { base: "main", depends_on: [] } },
    });
    // only branches are main (base) and big-feature (integration) → nothing to add
    repo.git("branch", "big-feature");
    let asked = false;
    const code = await addInteractive(ctxFor(repo), "big-feature", async () => {
      asked = true;
      return [];
    });
    expect(code).toBe(0);
    expect(asked).toBe(false);
  });
});
