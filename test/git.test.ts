import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { createGit, GitError } from "../src/git.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("git wrapper", () => {
  it("runs a command and returns trimmed stdout", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    expect(git.run("rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });

  it("throws GitError with stderr on failure", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    expect(() => git.run("checkout", "does-not-exist")).toThrow(GitError);
  });

  it("branchExists reports local branches", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    expect(git.branchExists("main")).toBe(true);
    expect(git.branchExists("nope")).toBe(false);
  });

  it("isClean reflects working tree state", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    expect(git.isClean()).toBe(true);
    writeFileSync(join(repo.dir, "x.txt"), "dirty");
    expect(git.isClean()).toBe(false);
  });

  it("branches lists local branch names", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("branch", "fix-a");
    repo.git("branch", "fix-b");
    const names = git.branches();
    expect(names).toContain("main");
    expect(names).toContain("fix-a");
    expect(names).toContain("fix-b");
  });

  it("gitPath resolves a file inside the git directory", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    const p = git.gitPath("knit.yaml");
    expect(p.endsWith("/.git/knit.yaml")).toBe(true);
  });

  it("isAncestor detects reachability", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    const first = git.run("rev-parse", "HEAD");
    repo.commitFile("a.txt", "a", "second");
    expect(git.isAncestor(first, "HEAD")).toBe(true);
    expect(git.isAncestor("HEAD", first)).toBe(false);
  });
});
