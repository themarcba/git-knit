import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { strand } from "../src/commands/strand.js";
import { loadConfig } from "../src/config.js";
import type { Ctx } from "../src/commands/context.js";
import type { Ui } from "../src/ui/spinner.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

function silentUi(): Ui {
  return {
    step: () => {},
    ok: () => {},
    fail: () => {},
    info: () => {},
    warn: () => {},
    plain: () => {},
  };
}

function makeCtx(dir: string, interactive = true): Ctx {
  const git = createGit(dir);
  return {
    git,
    root: dir,
    configFile: git.gitPath("knit.yaml"),
    ui: silentUi(),
    glyphs: {} as any,
    palette: {} as any,
    interactive,
    debug: false,
  };
}

const alwaysConfirm = async () => true;
const neverConfirm = async () => false;

describe("strand", () => {
  it("branches off main, records the dependency, and checks it out", async () => {
    repo = makeRepo();
    // On an existing integration branch.
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("branch", "existing-dep");
    const ctx = makeCtx(repo.dir);
    // Pre-declare big-feature so it's already an integration.
    writeFileSync(
      ctx.configFile,
      "integrations:\n  big-feature:\n    base: main\n    depends_on:\n      - existing-dep\n",
    );

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: neverConfirm,
    });

    expect(res.status).toBe("ok");
    expect(ctx.git.branchExists("small-fix")).toBe(true);
    expect(ctx.git.currentBranch()).toBe("small-fix");
    // Branched off main: main is an ancestor, nothing extra on top yet.
    expect(ctx.git.revParse("small-fix")).toBe(ctx.git.revParse("main"));
    const cfg = loadConfig(ctx.configFile);
    expect(cfg.integrations["big-feature"].depends_on).toEqual([
      "existing-dep",
      "small-fix",
    ]);
  });

  it("branches off the ref given by --from", async () => {
    repo = makeRepo();
    // A separate line of history to branch from.
    repo.git("checkout", "-q", "-b", "develop");
    repo.commitFile("d.txt", "d", "d");
    repo.git("checkout", "-q", "-b", "big-feature", "main");
    const ctx = makeCtx(repo.dir);
    writeFileSync(
      ctx.configFile,
      "integrations:\n  big-feature:\n    base: main\n    depends_on: []\n",
    );

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: neverConfirm,
      from: "develop",
    });

    expect(res.status).toBe("ok");
    expect(ctx.git.revParse("small-fix")).toBe(ctx.git.revParse("develop"));
  });

  it("errors when a tracked file has uncommitted changes", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const ctx = makeCtx(repo.dir);
    writeFileSync(
      ctx.configFile,
      "integrations:\n  big-feature:\n    base: main\n    depends_on: []\n",
    );
    // Dirty a committed, tracked file.
    writeFileSync(join(repo.dir, "README.md"), "dirty\n");

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: alwaysConfirm,
    });

    expect(res.status).toBe("error");
    expect(ctx.git.branchExists("small-fix")).toBe(false);
  });

  it("errors when the new branch already exists", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("branch", "small-fix");
    const ctx = makeCtx(repo.dir);
    writeFileSync(
      ctx.configFile,
      "integrations:\n  big-feature:\n    base: main\n    depends_on: []\n",
    );

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: alwaysConfirm,
    });

    expect(res.status).toBe("error");
    // Config left untouched.
    expect(loadConfig(ctx.configFile).integrations["big-feature"].depends_on).toEqual([]);
  });

  it("errors when the new branch equals the current branch", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const ctx = makeCtx(repo.dir);
    writeFileSync(
      ctx.configFile,
      "integrations:\n  big-feature:\n    base: main\n    depends_on: []\n",
    );

    const res = await strand(ctx, "big-feature", {
      ui: ctx.ui,
      confirmCreateIntegration: alwaysConfirm,
    });

    expect(res.status).toBe("error");
  });

  it("errors when the --from ref does not exist", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const ctx = makeCtx(repo.dir);
    writeFileSync(
      ctx.configFile,
      "integrations:\n  big-feature:\n    base: main\n    depends_on: []\n",
    );

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: alwaysConfirm,
      from: "ghost",
    });

    expect(res.status).toBe("error");
    expect(ctx.git.branchExists("small-fix")).toBe(false);
  });

  it("creates the integration on demand when the user confirms", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const ctx = makeCtx(repo.dir);
    // No config yet — big-feature is not an integration.

    let asked: string | null = null;
    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: async (name) => {
        asked = name;
        return true;
      },
    });

    expect(asked).toBe("big-feature");
    expect(res.status).toBe("ok");
    expect(res).toMatchObject({ created: true });
    expect(ctx.git.currentBranch()).toBe("small-fix");
    const cfg = loadConfig(ctx.configFile);
    expect(cfg.integrations["big-feature"].base).toBe("main");
    expect(cfg.integrations["big-feature"].depends_on).toEqual(["small-fix"]);
  });

  it("cancels without changes when the user declines to create the integration", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const ctx = makeCtx(repo.dir);

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      confirmCreateIntegration: neverConfirm,
    });

    expect(res.status).toBe("cancelled");
    expect(ctx.git.branchExists("small-fix")).toBe(false);
    expect(ctx.git.currentBranch()).toBe("big-feature");
    // No config written.
    expect(() => loadConfig(ctx.configFile)).toThrow();
  });

  it("errors (not cancels) on a new integration when non-interactive", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const ctx = makeCtx(repo.dir, false);

    const res = await strand(ctx, "small-fix", {
      ui: ctx.ui,
      // Should never be consulted — non-interactive can't prompt.
      confirmCreateIntegration: async () => {
        throw new Error("must not prompt when non-interactive");
      },
    });

    expect(res.status).toBe("error");
    expect(ctx.git.branchExists("small-fix")).toBe(false);
  });
});
