import { execFileSync } from "node:child_process";

export class GitError extends Error {
  constructor(
    message: string,
    public readonly args: string[],
    public readonly stderr: string,
    public readonly code: number | null,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface Git {
  cwd: string;
  run: (...args: string[]) => string;
  tryRun: (...args: string[]) => { ok: boolean; stdout: string; stderr: string };
  branchExists: (name: string) => boolean;
  isClean: () => boolean;
  isAncestor: (ancestor: string, descendant: string) => boolean;
  revParse: (ref: string) => string;
  currentBranch: () => string;
  branches: () => string[];
}

export function createGit(cwd: string): Git {
  const run = (...args: string[]): string => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    } catch (err: any) {
      const stderr = err?.stderr?.toString?.() ?? "";
      throw new GitError(`git ${args.join(" ")} failed`, args, stderr, err?.status ?? null);
    }
  };
  const tryRun = (...args: string[]) => {
    try {
      const stdout = execFileSync("git", args, { cwd, encoding: "utf8" });
      return { ok: true, stdout: stdout.trim(), stderr: "" };
    } catch (err: any) {
      return { ok: false, stdout: "", stderr: err?.stderr?.toString?.() ?? "" };
    }
  };
  return {
    cwd,
    run,
    tryRun,
    branchExists: (name) =>
      tryRun("show-ref", "--verify", "--quiet", `refs/heads/${name}`).ok,
    isClean: () => run("status", "--porcelain") === "",
    isAncestor: (ancestor, descendant) =>
      tryRun("merge-base", "--is-ancestor", ancestor, descendant).ok,
    revParse: (ref) => run("rev-parse", ref),
    currentBranch: () => run("rev-parse", "--abbrev-ref", "HEAD"),
    branches: () => {
      const out = run("for-each-ref", "--format=%(refname:short)", "refs/heads");
      return out === "" ? [] : out.split("\n");
    },
  };
}
