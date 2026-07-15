import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { run } from "../src/cli.js";
import { loadConfig } from "../src/config.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("cli", () => {
  it("init creates a config", async () => {
    repo = makeRepo();
    const code = await run(["init", "bf", "main"], repo.dir);
    expect(code).toBe(0);
    expect(loadConfig(repo.dir).integrations["bf"].base).toBe("main");
  });

  it("init refuses to clobber existing config", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    const code = await run(["init"], repo.dir);
    expect(code).not.toBe(0);
  });

  it("add then remove updates config", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    repo.git("branch", "fix-a");
    expect(await run(["add", "bf", "fix-a"], repo.dir)).toBe(0);
    expect(loadConfig(repo.dir).integrations["bf"].depends_on).toContain("fix-a");
    expect(await run(["remove", "bf", "fix-a"], repo.dir)).toBe(0);
    expect(loadConfig(repo.dir).integrations["bf"].depends_on).not.toContain("fix-a");
  });

  it("add creates a new integration with --base", async () => {
    repo = makeRepo();
    await run(["init"], repo.dir);
    repo.git("branch", "fix-a");
    const code = await run(["add", "bf", "fix-a", "--base", "main"], repo.dir);
    expect(code).toBe(0);
    expect(loadConfig(repo.dir).integrations["bf"].base).toBe("main");
  });

  it("sync assembles the integration branch", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "main");
    await run(["add", "bf", "fix-a"], repo.dir);
    const code = await run(["--no-interactive", "sync", "bf"], repo.dir);
    expect(code).toBe(0);
    const git = (await import("../src/git.js")).createGit(repo.dir);
    expect(git.branchExists("bf")).toBe(true);
  });

  it("status runs and returns 0", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    expect(await run(["status"], repo.dir)).toBe(0);
  });

  it("list runs and returns 0", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    expect(await run(["list"], repo.dir)).toBe(0);
  });

  it("returns non-zero outside a git repo", async () => {
    const code = await run(["list"], "/");
    expect(code).not.toBe(0);
  });
});
