import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { computeDrift } from "../src/drift.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("computeDrift", () => {
  it("reports not-knitted when integration branch is missing", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("branch", "fix-a");
    const d = computeDrift(git, "big-feature", { base: "main", depends_on: ["fix-a"] });
    expect(d.knitted).toBe(false);
  });

  it("reports current when all deps are merged", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a work");
    repo.git("checkout", "-q", "main");
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("merge", "-q", "--no-ff", "fix-a", "-m", "merge");
    repo.git("checkout", "-q", "main");
    const d = computeDrift(git, "big-feature", { base: "main", depends_on: ["fix-a"] });
    expect(d.knitted).toBe(true);
    expect(d.baseCurrent).toBe(true);
    expect(d.dependencies.find((x) => x.branch === "fix-a")!.merged).toBe(true);
    expect(d.upToDate).toBe(true);
  });

  it("flags a dependency with new commits", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a1");
    repo.git("checkout", "-q", "main");
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("merge", "-q", "--no-ff", "fix-a", "-m", "merge");
    repo.git("checkout", "-q", "fix-a");
    repo.commitFile("a.txt", "a2", "a2");
    repo.git("checkout", "-q", "main");
    const d = computeDrift(git, "big-feature", { base: "main", depends_on: ["fix-a"] });
    expect(d.upToDate).toBe(false);
    expect(d.dependencies.find((x) => x.branch === "fix-a")!.merged).toBe(false);
  });
});
