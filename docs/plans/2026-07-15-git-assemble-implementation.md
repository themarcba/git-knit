# git-assemble Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `git-assemble`, a TypeScript CLI that composes multiple independent local branches into a rebuildable integration branch declared in a committed JSON config.

**Architecture:** A `git assemble` subcommand (npm bin `git-assemble`). All git access goes through one typed wrapper that shells out to the `git` CLI. Pure-logic layers (config read/validate/write, ancestor-based drift, UI glyph/color degradation) are unit-tested; commands are covered by integration tests that run against real git repos built in temp dirs. `sync` rebuilds the integration branch fresh from base + dependencies (merge model, local heads only).

**Tech Stack:** TypeScript, Node 23, `commander` (args), `ora` (spinner), `picocolors` (color), `vitest` (tests), `tsup` (bundle). ESM.

Full design: `docs/plans/2026-07-15-git-assemble-design.md`.

---

## Conventions for the executing engineer

- **TDD always** (superpowers:test-driven-development): write the failing test, run it red, implement minimally, run it green, commit.
- **Commit after every green step.** Small commits.
- Language: TypeScript, ESM (`"type": "module"`), strict mode.
- Test runner: `vitest`. Run a single test with `npx vitest run <path> -t "<name>"`.
- Exit codes: success `0`, any handled failure non-zero (`1`).
- Never print emojis. Glyphs come from `src/ui/glyphs.ts` only.
- All git invocations go through `src/git.ts` — never call `child_process` directly elsewhere.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/cli.ts`

**Step 1: Create `package.json`**

```json
{
  "name": "git-assemble",
  "version": "0.1.0",
  "description": "Compose multiple independent branches into a rebuildable integration branch.",
  "type": "module",
  "bin": { "git-assemble": "dist/cli.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/cli.ts --format esm --clean",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=18" },
  "license": "MIT"
}
```

**Step 2: Install dependencies**

Run:
```bash
npm install commander ora picocolors
npm install -D typescript tsup vitest @types/node
```
Expected: installs succeed, `node_modules` present.

**Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

**Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
  },
});
```

**Step 5: Create `.gitignore`**

```
node_modules
dist
```

**Step 6: Create placeholder `src/cli.ts`**

```ts
#!/usr/bin/env node
console.log("git-assemble");
```

**Step 7: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold git-assemble project"
```

---

## Task 2: UI layer — glyphs and color degradation

**Files:**
- Create: `src/ui/glyphs.ts`, `src/ui/color.ts`
- Test: `test/ui.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { glyphs } from "../src/ui/glyphs.js";

describe("glyphs", () => {
  it("provides unicode glyphs when unicode is supported", () => {
    const g = glyphs(true);
    expect(g.success).toBe("✓");
    expect(g.failure).toBe("✗");
    expect(g.arrow).toBe("→");
    expect(g.warning).toBe("⚠");
    expect(g.bullet).toBe("•");
    expect(g.ahead).toBe("↑");
    expect(g.progress).toBe("⋯");
  });

  it("falls back to ASCII when unicode is not supported", () => {
    const g = glyphs(false);
    expect(g.success).toBe("v");
    expect(g.failure).toBe("x");
    expect(g.arrow).toBe("->");
  });

  it("contains no emoji characters", () => {
    const g = glyphs(true);
    const all = Object.values(g).join("");
    // Emoji live in high unicode planes; assert every char is BMP.
    for (const ch of all) {
      expect(ch.codePointAt(0)!).toBeLessThan(0x2800);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/ui.test.ts`
Expected: FAIL (cannot find module `../src/ui/glyphs.js`).

**Step 3: Write minimal implementation**

`src/ui/glyphs.ts`:
```ts
export interface Glyphs {
  success: string;
  failure: string;
  arrow: string;
  warning: string;
  bullet: string;
  ahead: string;
  behind: string;
  progress: string;
}

const UNICODE: Glyphs = {
  success: "✓",
  failure: "✗",
  arrow: "→",
  warning: "⚠",
  bullet: "•",
  ahead: "↑",
  behind: "↓",
  progress: "⋯",
};

const ASCII: Glyphs = {
  success: "v",
  failure: "x",
  arrow: "->",
  warning: "!",
  bullet: "*",
  ahead: "^",
  behind: "v",
  progress: "...",
};

export function glyphs(unicode: boolean): Glyphs {
  return unicode ? UNICODE : ASCII;
}
```

`src/ui/color.ts`:
```ts
import pc from "picocolors";

export function colorEnabled(env = process.env, stream = process.stdout): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return true;
  return Boolean(stream.isTTY);
}

export type Painter = (s: string) => string;

export interface Palette {
  success: Painter;
  failure: Painter;
  warning: Painter;
  dim: Painter;
  bold: Painter;
}

const identity: Painter = (s) => s;

export function palette(enabled: boolean): Palette {
  if (!enabled) {
    return { success: identity, failure: identity, warning: identity, dim: identity, bold: identity };
  }
  return {
    success: pc.green,
    failure: pc.red,
    warning: pc.yellow,
    dim: pc.dim,
    bold: pc.bold,
  };
}
```

**Step 4: Add color test to `test/ui.test.ts`**

```ts
import { colorEnabled, palette } from "../src/ui/color.js";

describe("color", () => {
  it("disables color when NO_COLOR is set", () => {
    expect(colorEnabled({ NO_COLOR: "1" }, { isTTY: true } as any)).toBe(false);
  });
  it("disables color for non-TTY", () => {
    expect(colorEnabled({}, { isTTY: false } as any)).toBe(false);
  });
  it("palette is identity when disabled", () => {
    const p = palette(false);
    expect(p.success("ok")).toBe("ok");
  });
});
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run test/ui.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add UI glyphs and color degradation"
```

---

## Task 3: Git wrapper with typed errors

**Files:**
- Create: `src/git.ts`
- Test: `test/git.test.ts`
- Create test helper: `test/helpers/repo.ts`

**Step 1: Write the temp-repo helper** (`test/helpers/repo.ts`)

```ts
import { mkdtempSync, rmSync } from "node:fs";
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
    const { writeFileSync } = require("node:fs");
    writeFileSync(join(dir, path), content);
    git("add", path);
    git("commit", "-q", "-m", message);
  };
  commitFile("README.md", "init\n", "initial");
  return { dir, git, commitFile, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
```

**Step 2: Write the failing test** (`test/git.test.ts`)

```ts
import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, TempRepo } from "./helpers/repo.js";
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
    require("node:fs").writeFileSync(require("node:path").join(repo.dir, "x.txt"), "dirty");
    expect(git.isClean()).toBe(false);
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
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run test/git.test.ts`
Expected: FAIL (cannot find `../src/git.js`).

**Step 4: Write minimal implementation** (`src/git.ts`)

```ts
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
  };
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run test/git.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add typed git wrapper and temp-repo test helper"
```

---

## Task 4: Config load / validate / write

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, TempRepo } from "./helpers/repo.js";
import {
  loadConfig, writeConfig, addDependency, removeDependency,
  emptyConfig, ConfigError, CONFIG_FILENAME,
} from "../src/config.js";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("config", () => {
  it("loadConfig throws ConfigError when file missing", () => {
    repo = makeRepo();
    expect(() => loadConfig(repo.dir)).toThrow(ConfigError);
  });

  it("round-trips an integration with a mandatory base", () => {
    repo = makeRepo();
    let cfg = emptyConfig();
    cfg = addDependency(cfg, "big-feature", "fix-a", "main");
    writeConfig(repo.dir, cfg);
    const loaded = loadConfig(repo.dir);
    expect(loaded.integrations["big-feature"].base).toBe("main");
    expect(loaded.integrations["big-feature"].depends_on).toEqual(["fix-a"]);
  });

  it("addDependency preserves order and rejects duplicates", () => {
    let cfg = addDependency(emptyConfig(), "bf", "a", "main");
    cfg = addDependency(cfg, "bf", "b", "main");
    expect(cfg.integrations["bf"].depends_on).toEqual(["a", "b"]);
    expect(() => addDependency(cfg, "bf", "a", "main")).toThrow(ConfigError);
  });

  it("removeDependency removes but keeps empty integration", () => {
    let cfg = addDependency(emptyConfig(), "bf", "a", "main");
    cfg = removeDependency(cfg, "bf", "a");
    expect(cfg.integrations["bf"].depends_on).toEqual([]);
    expect(() => removeDependency(cfg, "bf", "missing")).toThrow(ConfigError);
  });

  it("rejects config missing a base", () => {
    repo = makeRepo();
    writeFileSync(
      join(repo.dir, CONFIG_FILENAME),
      JSON.stringify({ integrations: { bf: { depends_on: [] } } }),
    );
    expect(() => loadConfig(repo.dir)).toThrow(ConfigError);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL (cannot find `../src/config.js`).

**Step 3: Write minimal implementation** (`src/config.ts`)

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILENAME = ".assemble.json";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface Integration {
  base: string;
  depends_on: string[];
}
export interface Config {
  integrations: Record<string, Integration>;
}

export function emptyConfig(): Config {
  return { integrations: {} };
}

export function configPath(repoDir: string): string {
  return join(repoDir, CONFIG_FILENAME);
}

export function loadConfig(repoDir: string): Config {
  const p = configPath(repoDir);
  if (!existsSync(p)) throw new ConfigError(`No ${CONFIG_FILENAME} found`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    throw new ConfigError(`${CONFIG_FILENAME} is not valid JSON`);
  }
  return validate(raw);
}

function validate(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || !("integrations" in raw)) {
    throw new ConfigError(`${CONFIG_FILENAME} must have an "integrations" object`);
  }
  const integrations = (raw as any).integrations;
  if (typeof integrations !== "object" || integrations === null) {
    throw new ConfigError(`"integrations" must be an object`);
  }
  for (const [name, value] of Object.entries<any>(integrations)) {
    if (!value || typeof value.base !== "string" || value.base === "") {
      throw new ConfigError(`Integration "${name}" is missing a "base"`);
    }
    if (!Array.isArray(value.depends_on) || value.depends_on.some((d: unknown) => typeof d !== "string")) {
      throw new ConfigError(`Integration "${name}" has an invalid "depends_on"`);
    }
  }
  return raw as Config;
}

export function writeConfig(repoDir: string, cfg: Config): void {
  validate(cfg);
  writeFileSync(configPath(repoDir), JSON.stringify(cfg, null, 2) + "\n");
}

export function addDependency(cfg: Config, integration: string, branch: string, base?: string): Config {
  const next: Config = { integrations: { ...cfg.integrations } };
  const existing = next.integrations[integration];
  if (!existing) {
    if (!base) throw new ConfigError(`New integration "${integration}" needs a base`);
    next.integrations[integration] = { base, depends_on: [branch] };
    return next;
  }
  if (existing.depends_on.includes(branch)) {
    throw new ConfigError(`${branch} is already a dependency of ${integration}`);
  }
  next.integrations[integration] = { base: existing.base, depends_on: [...existing.depends_on, branch] };
  return next;
}

export function removeDependency(cfg: Config, integration: string, branch: string): Config {
  const existing = cfg.integrations[integration];
  if (!existing) throw new ConfigError(`No integration "${integration}"`);
  if (!existing.depends_on.includes(branch)) {
    throw new ConfigError(`${branch} is not a dependency of ${integration}`);
  }
  const next: Config = { integrations: { ...cfg.integrations } };
  next.integrations[integration] = {
    base: existing.base,
    depends_on: existing.depends_on.filter((d) => d !== branch),
  };
  return next;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/config.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add config load/validate/write with add/remove helpers"
```

---

## Task 5: Drift detection

**Files:**
- Create: `src/drift.ts`
- Test: `test/drift.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { computeDrift } from "../src/drift.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("computeDrift", () => {
  it("reports not-assembled when integration branch is missing", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    repo.git("branch", "fix-a");
    const d = computeDrift(git, "big-feature", { base: "main", depends_on: ["fix-a"] });
    expect(d.assembled).toBe(false);
  });

  it("reports current when all deps are merged", () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    // fix-a diverges from main
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a work");
    repo.git("checkout", "-q", "main");
    // integration = main + fix-a merged
    repo.git("checkout", "-q", "-b", "big-feature");
    repo.git("merge", "-q", "--no-ff", "fix-a", "-m", "merge");
    repo.git("checkout", "-q", "main");
    const d = computeDrift(git, "big-feature", { base: "main", depends_on: ["fix-a"] });
    expect(d.assembled).toBe(true);
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
    // fix-a advances after assembly
    repo.git("checkout", "-q", "fix-a");
    repo.commitFile("a.txt", "a2", "a2");
    repo.git("checkout", "-q", "main");
    const d = computeDrift(git, "big-feature", { base: "main", depends_on: ["fix-a"] });
    expect(d.upToDate).toBe(false);
    expect(d.dependencies.find((x) => x.branch === "fix-a")!.merged).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/drift.test.ts`
Expected: FAIL (cannot find `../src/drift.js`).

**Step 3: Write minimal implementation** (`src/drift.ts`)

```ts
import type { Git } from "./git.js";
import type { Integration } from "./config.js";

export interface DepDrift {
  branch: string;
  exists: boolean;
  merged: boolean;
}
export interface Drift {
  integration: string;
  assembled: boolean;
  baseCurrent: boolean;
  dependencies: DepDrift[];
  upToDate: boolean;
}

export function computeDrift(git: Git, name: string, integ: Integration): Drift {
  const assembled = git.branchExists(name);
  if (!assembled) {
    return {
      integration: name,
      assembled: false,
      baseCurrent: false,
      dependencies: integ.depends_on.map((b) => ({ branch: b, exists: git.branchExists(b), merged: false })),
      upToDate: false,
    };
  }
  const baseCurrent = git.branchExists(integ.base) && git.isAncestor(integ.base, name);
  const dependencies: DepDrift[] = integ.depends_on.map((b) => {
    const exists = git.branchExists(b);
    return { branch: b, exists, merged: exists ? git.isAncestor(b, name) : false };
  });
  const upToDate = baseCurrent && dependencies.every((d) => d.merged);
  return { integration: name, assembled, baseCurrent, dependencies, upToDate };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/drift.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ancestor-based drift detection"
```

---

## Task 6: sync core (non-interactive path)

Split the merge logic from the prompt so it is testable without a TTY.

**Files:**
- Create: `src/commands/sync.ts`
- Test: `test/sync.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, TempRepo } from "./helpers/repo.js";
import { createGit } from "../src/git.js";
import { syncIntegration } from "../src/commands/sync.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

function silentUi() {
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

    const res = await syncIntegration(git, "bf", { base: "main", depends_on: ["fix-a", "fix-b"] }, {
      ui: silentUi(),
      onConflict: async () => "abort",
    });
    expect(res.status).toBe("ok");
    expect(git.branchExists("bf")).toBe(true);
    expect(git.isAncestor("fix-a", "bf")).toBe(true);
    expect(git.isAncestor("fix-b", "bf")).toBe(true);
  });

  it("aborts and restores the pre-sync snapshot on conflict", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    // two branches that touch the same file → conflict
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("c.txt", "from-a", "a");
    repo.git("checkout", "-q", "-b", "fix-b", "main");
    repo.commitFile("c.txt", "from-b", "b");
    repo.git("checkout", "-q", "main");
    // pre-existing bf at main
    repo.git("branch", "bf");
    const before = git.revParse("bf");

    const res = await syncIntegration(git, "bf", { base: "main", depends_on: ["fix-a", "fix-b"] }, {
      ui: silentUi(),
      onConflict: async () => "abort",
    });
    expect(res.status).toBe("conflict-aborted");
    expect(git.revParse("bf")).toBe(before);
    expect(git.isClean()).toBe(true);
  });

  it("errors on missing dependency branch", async () => {
    repo = makeRepo();
    const git = createGit(repo.dir);
    const res = await syncIntegration(git, "bf", { base: "main", depends_on: ["ghost"] }, {
      ui: silentUi(),
      onConflict: async () => "abort",
    });
    expect(res.status).toBe("error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/sync.test.ts`
Expected: FAIL (cannot find `../src/commands/sync.js`).

**Step 3: Write minimal implementation** (`src/commands/sync.ts`)

```ts
import type { Git } from "../git.js";
import type { Integration } from "../config.js";

export type ConflictChoice = "resolve" | "abort";
export interface SyncUi {
  step: (msg: string) => void;
  ok: (msg: string) => void;
  fail: (msg: string) => void;
  info: (msg: string) => void;
}
export interface SyncOptions {
  ui: SyncUi;
  onConflict: (dep: string) => Promise<ConflictChoice>;
  force?: boolean;
}
export type SyncResult =
  | { status: "ok"; merged: string[] }
  | { status: "conflict-aborted"; dep: string }
  | { status: "conflict-resolve"; dep: string }
  | { status: "error"; message: string };

export async function syncIntegration(
  git: Git,
  name: string,
  integ: Integration,
  opts: SyncOptions,
): Promise<SyncResult> {
  // Preconditions
  if (!git.isClean()) return fail(opts, "Working tree is not clean");
  if (!git.branchExists(integ.base)) return fail(opts, `Base branch "${integ.base}" not found`);
  const missing = integ.depends_on.filter((b) => !git.branchExists(b));
  if (missing.length) return fail(opts, `Missing dependency branches: ${missing.join(", ")}`);

  const preExists = git.branchExists(name);
  const snapshot = preExists ? git.revParse(name) : null;

  // Stray-commit guard
  if (preExists && !opts.force) {
    const reachable = git.isAncestor(name, integ.base) ||
      integ.depends_on.some((b) => git.isAncestor(name, b)) ||
      integ.depends_on.every((b) => git.isAncestor(b, name)) && git.isAncestor(integ.base, name);
    // If current integration tip is NOT reachable from base and its tip has
    // commits not produced by a rebuild, require --force. Conservative check:
    const tipOnBaseOrDeps = git.isAncestor(name, integ.base);
    if (!tipOnBaseOrDeps && !isRebuildShaped(git, name, integ)) {
      return fail(opts, `"${name}" has commits not from base or dependencies; re-run with --force`);
    }
  }

  opts.ui.step(`rebuilding ${name} from ${integ.base}`);
  git.run("checkout", "-B", name, integ.base);
  opts.ui.ok(`reset to ${integ.base}`);

  const merged: string[] = [];
  for (const dep of integ.depends_on) {
    opts.ui.step(`merging ${dep}`);
    const r = git.tryRun("merge", "--no-ff", "-m", `assemble: merge ${dep}`, dep);
    if (r.ok) {
      opts.ui.ok(`merged ${dep}`);
      merged.push(dep);
      continue;
    }
    opts.ui.fail(`merging ${dep} — conflict`);
    const choice = await opts.onConflict(dep);
    if (choice === "resolve") {
      return { status: "conflict-resolve", dep };
    }
    git.tryRun("merge", "--abort");
    if (snapshot) git.run("checkout", "-B", name, snapshot);
    else git.tryRun("checkout", integ.base); // detach from partial branch
    return { status: "conflict-aborted", dep };
  }
  opts.ui.ok(`${name} assembled (${merged.length} branches)`);
  return { status: "ok", merged };
}

function isRebuildShaped(git: Git, name: string, integ: Integration): boolean {
  // A rebuild-shaped branch: every dep is an ancestor and base is an ancestor.
  return git.isAncestor(integ.base, name) && integ.depends_on.every((b) => git.isAncestor(b, name));
}

function fail(opts: SyncOptions, message: string): SyncResult {
  opts.ui.fail(message);
  return { status: "error", message };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/sync.test.ts`
Expected: PASS. If the stray-commit guard misfires for the pre-existing `bf`
at `main` case, simplify `isRebuildShaped`/guard so a branch equal to `base`
(no extra commits) is always allowed; adjust until the three tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add sync core with rebuild, merge, and abort-on-conflict"
```

---

## Task 7: UI spinner runner + interactive conflict prompt

**Files:**
- Create: `src/ui/spinner.ts`, `src/ui/prompt.ts`
- Test: `test/prompt.test.ts`

**Step 1: Write the failing test** (prompt parsing is the pure part)

```ts
import { describe, it, expect } from "vitest";
import { parseConflictChoice } from "../src/ui/prompt.js";

describe("parseConflictChoice", () => {
  it("maps r/resolve", () => {
    expect(parseConflictChoice("r")).toBe("resolve");
    expect(parseConflictChoice("resolve")).toBe("resolve");
    expect(parseConflictChoice("R")).toBe("resolve");
  });
  it("maps a/abort", () => {
    expect(parseConflictChoice("a")).toBe("abort");
    expect(parseConflictChoice("abort")).toBe("abort");
  });
  it("returns null for unknown input", () => {
    expect(parseConflictChoice("")).toBeNull();
    expect(parseConflictChoice("x")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/prompt.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

`src/ui/prompt.ts`:
```ts
import { createInterface } from "node:readline/promises";
import type { ConflictChoice } from "../commands/sync.js";

export function parseConflictChoice(input: string): ConflictChoice | null {
  const v = input.trim().toLowerCase();
  if (v === "r" || v === "resolve") return "resolve";
  if (v === "a" || v === "abort") return "abort";
  return null;
}

export function makeConflictPrompt(interactive: boolean) {
  return async (dep: string): Promise<ConflictChoice> => {
    if (!interactive) return "abort";
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (;;) {
        const answer = await rl.question(
          `  Conflict merging ${dep}. [r]esolve manually or [a]bort? `,
        );
        const choice = parseConflictChoice(answer);
        if (choice) return choice;
      }
    } finally {
      rl.close();
    }
  };
}
```

`src/ui/spinner.ts`:
```ts
import ora, { type Ora } from "ora";
import { glyphs } from "./glyphs.js";
import { palette } from "./color.js";

export interface Ui {
  step: (msg: string) => void;
  ok: (msg: string) => void;
  fail: (msg: string) => void;
  info: (msg: string) => void;
}

export function makeUi(opts: { color: boolean; unicode: boolean; spinner: boolean }): Ui {
  const g = glyphs(opts.unicode);
  const p = palette(opts.color);
  let active: Ora | null = null;

  const stop = () => {
    if (active) { active.stop(); active = null; }
  };
  return {
    step: (msg) => {
      if (opts.spinner) {
        active = ora({ text: msg, prefixText: " " }).start();
      } else {
        process.stdout.write(`  ${p.dim(g.progress)} ${msg}\n`);
      }
    },
    ok: (msg) => {
      stop();
      process.stdout.write(`  ${p.success(g.success)} ${msg}\n`);
    },
    fail: (msg) => {
      stop();
      process.stdout.write(`  ${p.failure(g.failure)} ${msg}\n`);
    },
    info: (msg) => {
      stop();
      process.stdout.write(`  ${p.dim(g.arrow)} ${msg}\n`);
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run test/prompt.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add spinner UI runner and interactive conflict prompt"
```

---

## Task 8: CLI wiring — commander + all commands

**Files:**
- Modify: `src/cli.ts`
- Create: `src/commands/status.ts`, `src/commands/list.ts`, `src/commands/init.ts`, `src/commands/edit.ts` (add/remove), `src/repo.ts` (find repo root)
- Test: `test/cli.test.ts` (integration, spawns the built or ts-run CLI)

**Step 1: Write repo-root helper** (`src/repo.ts`)

```ts
import { execFileSync } from "node:child_process";

export function repoRoot(cwd = process.cwd()): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
}
```

**Step 2: Write the failing integration test** (`test/cli.test.ts`)

Run the CLI in-process via an exported `run(argv, cwd)` function to keep tests
fast and avoid a build step.

```ts
import { describe, it, expect, afterEach } from "vitest";
import { makeRepo, TempRepo } from "./helpers/repo.js";
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

  it("sync assembles the integration branch", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    repo.git("checkout", "-q", "-b", "fix-a");
    repo.commitFile("a.txt", "a", "a");
    repo.git("checkout", "-q", "main");
    await run(["add", "bf", "fix-a"], repo.dir);
    const code = await run(["--no-interactive", "sync", "bf"], repo.dir);
    expect(code).toBe(0);
  });

  it("status runs and returns 0", async () => {
    repo = makeRepo();
    await run(["init", "bf", "main"], repo.dir);
    expect(await run(["status"], repo.dir)).toBe(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL (no `run` export / command modules missing).

**Step 4: Implement the command modules and `run`**

`src/commands/init.ts`, `src/commands/edit.ts` (exports `addCmd`, `removeCmd`),
`src/commands/status.ts`, `src/commands/list.ts` — each a function
`(git, root, args, ui) => number | Promise<number>` using `config.ts` and
`drift.ts`. Then rewrite `src/cli.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { createGit } from "./git.js";
import { repoRoot } from "./repo.js";
import { makeUi } from "./ui/spinner.js";
import { makeConflictPrompt } from "./ui/prompt.js";
import { colorEnabled } from "./ui/color.js";
import { loadConfig, emptyConfig, writeConfig, addDependency, removeDependency, CONFIG_FILENAME } from "./config.js";
import { computeDrift } from "./drift.js";
import { syncIntegration } from "./commands/sync.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function run(argv: string[], cwd = process.cwd()): Promise<number> {
  const color = colorEnabled();
  const unicode = process.env.TERM !== "dumb";
  const interactive = process.stdin.isTTY === true && !argv.includes("--no-interactive");
  const ui = makeUi({ color, unicode, spinner: interactive });

  let root: string;
  try {
    root = repoRoot(cwd);
  } catch {
    ui.fail("Not a git repository");
    return 1;
  }
  const git = createGit(root);
  const program = new Command();
  program.name("git-assemble").option("--no-interactive").option("--force").option("--debug").exitOverride();

  let code = 0;
  const guard = (fn: () => number | Promise<number>) => async () => {
    try { code = await fn(); }
    catch (e: any) {
      if (program.opts().debug) console.error(e);
      ui.fail(e?.message ?? String(e));
      code = 1;
    }
  };

  program.command("init [integration] [base]").action(guard(/* init logic */));
  program.command("add <integration> <branch>").option("--base <ref>").action(/* ... */);
  program.command("remove <integration> <branch>").action(/* ... */);
  program.command("sync [integration]").option("--all").action(/* uses syncIntegration + makeConflictPrompt(interactive) */);
  program.command("status [integration]").action(/* computeDrift + render */);
  program.command("list").action(/* render */);

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e: any) {
    if (e?.code === "commander.helpDisplayed" || e?.code === "commander.help") return 0;
    ui.fail(e?.message ?? "Command failed");
    return 1;
  }
  return code;
}

// Only auto-run when invoked as a binary, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((c) => process.exit(c));
}
```

Fill in each `action` using the already-tested helpers. `sync` builds
`onConflict = makeConflictPrompt(interactive)` and maps `SyncResult.status` to an
exit code (`ok` → 0, everything else → non-zero, printing the resolve
instructions for `conflict-resolve`). `init` seeds via `emptyConfig()` +
`addDependency` when args given, refuses if `CONFIG_FILENAME` exists.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS.

**Step 6: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all green.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: wire commander CLI with init/add/remove/sync/status/list"
```

---

## Task 9: Build, manual smoke test, README

**Files:**
- Create: `README.md`
- Verify: `dist/cli.js` builds and runs as `git assemble`

**Step 1: Build**

Run: `npm run build`
Expected: `dist/cli.js` produced.

**Step 2: Manual smoke test** (superpowers:verification-before-completion)

In a scratch repo, create two branches with commits, `git assemble init`,
`add`, `sync`, `status`, `list`. Confirm: spinners render on a TTY; `NO_COLOR=1`
and piping produce plain output; a deliberate conflict triggers the interactive
prompt and both `r`/`a` paths behave per spec.

**Step 3: Write `README.md`**

Cover: what it is (branches → integration branch), install, the config format,
each command with an example, the "commit on dependency branches, not the
integration branch" rule, and the v1 limitations (local-only, no remote fetch).

**Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README; build binary"
```

---

## Done criteria

- `npm test` and `npm run typecheck` green.
- `npm run build` produces a working `git assemble` subcommand.
- Manual smoke test confirms spinners, color degradation, and both conflict
  paths.
- All six commands behave per the design doc; zero emoji in any output.
