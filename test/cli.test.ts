import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { run } from "../src/cli.js";
import { loadConfig } from "../src/config.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("cli", () => {
  it("add creates the integration on demand (base defaults to main)", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    const code = await run(["add", "bf", "fix-a"], repo.dir);
    expect(code).toBe(0);
    const cfg = loadConfig(repo.configPath);
    expect(cfg.integrations["bf"].base).toBe("main");
    expect(cfg.integrations["bf"].depends_on).toContain("fix-a");
  });

  it("add then remove updates config", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    expect(await run(["add", "bf", "fix-a"], repo.dir)).toBe(0);
    expect(loadConfig(repo.configPath).integrations["bf"].depends_on).toContain("fix-a");
    expect(await run(["remove", "bf", "fix-a"], repo.dir)).toBe(0);
    expect(loadConfig(repo.configPath).integrations["bf"].depends_on).not.toContain("fix-a");
  });

  it("add honors an explicit --base when creating", async () => {
    repo = makeRepo();
    repo.git("branch", "trunk");
    repo.git("branch", "fix-a");
    const code = await run(["add", "bf", "fix-a", "--base", "trunk"], repo.dir);
    expect(code).toBe(0);
    expect(loadConfig(repo.configPath).integrations["bf"].base).toBe("trunk");
  });

  it("sync assembles the integration branch", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "main");
    await run(["add", "bf", "fix-a"], repo.dir);
    const code = await run(["--no-interactive", "sync", "bf"], repo.dir);
    expect(code).toBe(0);
    const git = (await import("../src/git.js")).createGit(repo.dir);
    expect(git.branchExists("bf")).toBe(true);
  });

  it("add without an integration targets the current branch", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("branch", "fix-a");
    // one-arg form: integration defaults to current branch, created with base main
    const code = await run(["add", "fix-a"], repo.dir);
    expect(code).toBe(0);
    const cfg = loadConfig(repo.configPath);
    expect(cfg.integrations["big-feature"].base).toBe("main");
    expect(cfg.integrations["big-feature"].depends_on).toContain("fix-a");
  });

  it("remove without an integration targets the current branch", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("branch", "fix-a");
    await run(["add", "fix-a"], repo.dir);
    const code = await run(["remove", "fix-a"], repo.dir);
    expect(code).toBe(0);
    expect(loadConfig(repo.configPath).integrations["big-feature"].depends_on).not.toContain("fix-a");
  });

  it("sync without an argument syncs the current branch", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "main");
    await run(["add", "big-feature", "fix-a"], repo.dir);
    // check out the integration branch, then sync with no name
    repo.git("checkout", "-q", "-B", "big-feature", "main");
    const code = await run(["--no-interactive", "sync"], repo.dir);
    expect(code).toBe(0);
    const git = (await import("../src/git.js")).createGit(repo.dir);
    expect(git.isAncestor("fix-a", "big-feature")).toBe(true);
  });

  it("sync with no arg on a non-integration branch fails helpfully", async () => {
    repo = makeRepo();
    repo.git("branch", "fix-a");
    await run(["add", "big-feature", "fix-a"], repo.dir);
    // still on main, which is not an integration
    const code = await run(["--no-interactive", "sync"], repo.dir);
    expect(code).not.toBe(0);
  });

  it("setup errors without an interactive terminal", async () => {
    repo = makeRepo();
    repo.git("checkout", "-q", "-b", "big-feature");
    const code = await run(["--no-interactive", "setup"], repo.dir);
    expect(code).not.toBe(0);
  });

  it("status on a fresh repo returns 0", async () => {
    repo = makeRepo();
    expect(await run(["status"], repo.dir)).toBe(0);
  });

  it("list on a fresh repo returns 0", async () => {
    repo = makeRepo();
    expect(await run(["list"], repo.dir)).toBe(0);
  });

  it("returns non-zero outside a git repo", async () => {
    const code = await run(["list"], "/");
    expect(code).not.toBe(0);
  });
});
