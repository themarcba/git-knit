import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface TempRepo {
  dir: string;
  git: (...args: string[]) => string;
  commitFile: (path: string, content: string, message: string) => void;
  cleanup: () => void;
}

export function makeRepo(): TempRepo {
  const dir = mkdtempSync(join(tmpdir(), "assemble-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  const commitFile = (path: string, content: string, message: string) => {
    writeFileSync(join(dir, path), content);
    git("add", path);
    git("commit", "-q", "-m", message);
  };
  commitFile("README.md", "init\n", "initial");
  return {
    dir,
    git,
    commitFile,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
