import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { syncIntegration, type SyncUi } from "../src/commands/sync.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

function silentUi(): SyncUi {
  return { step: () => {}, ok: () => {}, fail: () => {}, info: () => {} };
}

describe("syncIntegration", () => {
  it("rebuilds integration from base + deps", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "-b", "fix-b", "main");
    repo.commitFile("b.txt", "b", "b");
    repo.git("checkout", "-q", "main");

    const res = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a", "fix-b"] },
      { ui: silentUi(), onConflict: async () => "abort" },
    );
    expect(res.status).toBe("ok");
    expect(git.branchExists("bf")).toBe(true);
    expect(git.isAncestor("fix-a", "bf")).toBe(true);
    expect(git.isAncestor("fix-b", "bf")).toBe(true);
  });

  it("aborts and restores the pre-sync snapshot on conflict", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("c.txt", "from-a", "a");
    repo.git("checkout", "-q", "-b", "fix-b", "main");
    repo.commitFile("c.txt", "from-b", "b");
    repo.git("checkout", "-q", "main");
    repo.git("branch", "bf");
    const before = git.revParse("bf");

    const res = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a", "fix-b"] },
      { ui: silentUi(), onConflict: async () => "abort" },
    );
    expect(res.status).toBe("conflict-aborted");
    expect(git.revParse("bf")).toBe(before);
    expect(git.isClean()).toBe(true);
  });

  it("deletes a freshly-created integration branch on abort when none existed", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("c.txt", "from-a", "a");
    repo.git("checkout", "-q", "-b", "fix-b", "main");
    repo.commitFile("c.txt", "from-b", "b");
    repo.git("checkout", "-q", "main");

    const res = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a", "fix-b"] },
      { ui: silentUi(), onConflict: async () => "abort" },
    );
    expect(res.status).toBe("conflict-aborted");
    expect(git.branchExists("bf")).toBe(false);
    expect(git.isClean()).toBe(true);
  });

  it("leaves conflict markers in place when the user chooses to resolve", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("c.txt", "from-a", "a");
    repo.git("checkout", "-q", "-b", "fix-b", "main");
    repo.commitFile("c.txt", "from-b", "b");
    repo.git("checkout", "-q", "main");

    const res = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a", "fix-b"] },
      { ui: silentUi(), onConflict: async () => "resolve" },
    );
    expect(res.status).toBe("conflict-resolve");
    // The merge is left in progress with conflict markers for the user.
    expect(git.isClean()).toBe(false);
    expect(git.currentBranch()).toBe("bf");
    const conflicted = git.run("diff", "--name-only", "--diff-filter=U");
    expect(conflicted).toContain("c.txt");
  });

  it("syncs even when the committed config has uncommitted edits", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "main");
    // commit a config, then modify it in the working tree (as add/remove would)
    repo.commitFile(".knit.json", "{}\n", "add config");
    require("node:fs").writeFileSync(
      require("node:path").join(repo.dir, ".knit.json"),
      '{"integrations":{}}\n',
    );
    expect(git.isClean()).toBe(false);

    const res = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a"] },
      { ui: silentUi(), onConflict: async () => "abort" },
    );
    expect(res.status).toBe("ok");
  });

  it("errors on missing dependency branch", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    const res = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["ghost"] },
      { ui: silentUi(), onConflict: async () => "abort" },
    );
    expect(res.status).toBe("error");
  });

  it("blocks overwriting a branch with stray commits unless forced", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "main");
    // bf has a manual commit not present in base or deps
    repo.git("checkout", "-q", "-b", "bf");
    repo.commitFile("manual.txt", "manual", "manual work");
    repo.git("checkout", "-q", "main");

    const blocked = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a"] },
      { ui: silentUi(), onConflict: async () => "abort" },
    );
    expect(blocked.status).toBe("error");

    const forced = await syncIntegration(
      git,
      "bf",
      { base: "main", depends_on: ["fix-a"] },
      { ui: silentUi(), onConflict: async () => "abort", force: true },
    );
    expect(forced.status).toBe("ok");
  });
});
