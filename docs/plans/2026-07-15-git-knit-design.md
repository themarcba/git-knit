# git-knit — Design

**Date:** 2026-07-15
**Status:** Approved design, pre-implementation

## Overview

`git-knit` is a Node/TypeScript CLI, distributed on npm as `git-knit`,
exposing a `git knit` subcommand. It composes multiple independent local
branches into a rebuildable **integration branch**, declared in a committed JSON
config.

It is distinct from the existing `git-compose` (which coordinates multiple
*repositories*). This tool coordinates multiple *branches* inside one repo:
many independent strands → one composed integration branch.

### Core model

`sync` treats the integration branch as a disposable, generated artifact. It
resets that branch to `base`, then merges each dependency in listed order using
**local branch heads only**. Idempotent: same inputs → same result.

**User rule:** commit on dependency branches, never directly on the integration
branch. The integration branch is always rebuildable from `base + dependencies`.

Composition uses the **merge model** (independent peers merged together), not a
rebase/stack or cherry-pick model. Each dependency keeps its real history;
conflicts surface as normal git merge conflicts.

## Configuration

`.knit.json` at repo root, committed:

```json
{
  "integrations": {
    "big-feature": {
      "base": "main",
      "depends_on": ["fix-a", "adjustment-b", "cleanup-c"]
    }
  }
}
```

- `base` is **mandatory** per integration.
- Multiple integrations per file.
- Integration branch name = the config key (`big-feature`).
- Format is JSON (native to Node, zero parse dependency).

## Commands

```
git knit init [<integration> <base>]      # scaffold .knit.json
git knit add <integration> <branch>       # add a dependency
git knit remove <integration> <branch>    # remove a dependency
git knit sync <integration> | --all       # rebuild integration branch(es)
git knit status [integration]             # show deps + drift
git knit list                             # list integrations
```

### `sync <integration>` (or `--all`)

Rebuilds the integration branch from `base` + dependencies.

**Preconditions (checked before touching anything):**
- Inside a git repo; config exists and parses; named integration exists.
- Working tree is **clean** — otherwise abort (sync switches branches + resets).
- `base` and every `depends_on` branch **exist locally** — else list missing, stop.

**Algorithm:**
1. Resolve current head SHA of `base` and each dependency (local refs only).
2. Record the integration branch's current SHA (pre-sync snapshot), if it exists.
3. **Stray-commit guard:** if the integration branch has commits not reachable
   from `base` or any dependency (i.e. manual work), warn and require `--force`.
4. Reset the integration branch to base: `git checkout -B <integration> <base>`.
5. For each dependency in order: spinner → `git merge --no-ff <dep>`.
   - Clean merge → `✓ merged <dep>`, continue.
   - **Conflict** → stop spinner with `✗`, then prompt:
     - `[r]esolve manually` — leave conflict markers, print
       resolve-then-`sync`-again instructions, exit non-zero.
     - `[a]bort` — `git merge --abort`, restore integration branch to the
       pre-sync snapshot SHA, exit non-zero.
     - Non-interactive (CI / non-TTY / `--no-interactive`) → default to **abort**.
6. Success → `✓ <integration> assembled (N branches)`.

`sync` with no argument requires an explicit integration name; `sync --all`
syncs every integration in the config.

### `status [integration]`

Shows base, each dependency, and whether a `sync` would change anything, using a
cheap, reliable heuristic (the source of truth is always a fresh `sync`):

- **base drift** — is `base`'s head an ancestor of the integration tip?
  (`git merge-base --is-ancestor <base> <integration>`) If not → base moved.
- **dependency drift** — for each dep, is its head an ancestor of the integration
  tip? If not reachable → that dep has new commits not yet assembled.
- Integration branch missing → "not assembled".

The heuristic detects *missing* work, not a stale resolved conflict. Documented
honestly.

```
  big-feature   → out of date

    base   main          ✓ current
    fix-a                ✓ merged
    adjustment-b         ↑ 2 new commits
    cleanup-c            ✓ merged

  run: git knit sync big-feature
```

### `list`

```
  Integrations

  • big-feature   base main   3 branches
  • hotfix-bundle base 1.2.x  2 branches
```

### `init`

- No config → create `.knit.json`. Prompt for default base guess
  (current branch or `main`); write `{"integrations": {}}` skeleton, or seed one
  entry if run as `init <integration> <base>`.
- Config exists → `⚠ .knit.json already exists`, exit non-zero (never clobber).

### `add <integration> <branch>`

- Integration absent → create it; `base` required (prompt, or `--base <ref>`;
  default guess = current branch).
- `<branch>` missing locally → **warn only**, do not block.
- Duplicate → `⚠ <branch> already a dependency of <integration>`.
- Append to preserve order; write pretty JSON.
- Print `→ added <branch> to <integration>` + hint to `sync`.

### `remove <integration> <branch>`

- Error if integration or branch not present.
- Removing the last dependency keeps the (empty) integration entry. Removing an
  integration entirely is out of scope for v1 (hand-edit).
- Print `→ removed <branch> from <integration>`.

**Config writes** are always read → mutate in memory → validate → write pretty
JSON (2-space, trailing newline). Never partial writes.

## CLI aesthetics (first-class concern)

Polished, calm, consistent output. Unicode glyphs, **never emojis**. Color is
semantic and always degradable (respect `NO_COLOR`, non-TTY, pipes → plain).

- **Spinners** — `ora` for any latency op (merging each dependency). Spinner
  resolves into a `✓`/`✗` line. Under `--no-color`/pipe/CI: plain resolved lines,
  no spinner.
- **Symbols** (internal glyph map, ASCII fallback for dumb terminals):
  `→` action/flow, `✓` success, `✗` failure, `⚠` warning, `•` list item,
  `↑`/`↓` ahead/behind, `⋯` in progress.
- **Color** — `picocolors`: green success, red failure, yellow warning, dim
  secondary, bold names. Semantic only.
- **Layout** — aligned columns for `status`/`list`, 2-space indent, bold/dim
  section headers. No boxes/ASCII-art unless earned.

Example `sync` feel:

```
  git knit sync big-feature

  → rebuilding big-feature from main
  ✓ reset to main
  ⋯ merging fix-a          (spinner while running)
  ✓ merged fix-a
  ✓ merged adjustment-b
  ✗ merging cleanup-c — conflict
```

## Error handling

Every failure exits non-zero with a single clear `✗` line and, where useful, a
next-step hint. No stack traces in normal operation (`--debug` surfaces them).

Categories: not-a-repo, missing/invalid config, unknown integration, missing
local branch, dirty working tree, merge conflict, stray-commits-need-`--force`.

All git calls go through one wrapper that captures stdout/stderr and turns
non-zero git exits into typed errors.

## Testing (TDD)

- **Unit** — config parse/validate/mutate, drift/ancestor logic, glyph/color
  degradation, arg parsing. Pure functions, no git.
- **Integration** — real git repos in temp dirs via a test helper (init repo,
  make branches/commits), run each command, assert on branch SHAs, working-tree
  state, exit codes. Covers: clean sync, conflict→abort, conflict→resolve, base
  drift, `--force` guard, add/remove/init round-trips.
- **Runner:** vitest. The git wrapper is the only side-effecting layer, so
  integration tests exercise real git rather than mocking it.

## Project layout

```
src/
  cli.ts            entry (bin: git-knit)
  commands/         init, add, remove, sync, status, list
  git.ts            git wrapper (typed errors)
  config.ts         load/validate/write .knit.json
  ui/               spinner, glyphs, color, prompt
  drift.ts          ancestor-based status logic
test/
  helpers/          temp-repo builder
  *.test.ts
```

Distributed via npm with `bin`: `git-knit` → `dist/cli.js`. TypeScript
compiled with `tsc` (or `tsup` for a clean bundle).

## Tech choices summary

| Concern        | Choice                                   |
|----------------|------------------------------------------|
| Language       | TypeScript / Node                        |
| Git access     | Shell out to `git` CLI (typed wrapper)   |
| Arg parsing    | `commander` (or similar)                 |
| Spinner        | `ora`                                    |
| Color          | `picocolors`                             |
| Config format  | JSON (`.knit.json`)                  |
| Test runner    | `vitest`                                 |
| Composition    | Merge model, local heads, rebuild-fresh  |

## Explicitly out of scope for v1 (YAGNI)

- Remote fetch / any-ref dependencies (local-only for now; natural extension).
- rerere-style automatic conflict-resolution replay (git's built-in `rerere`
  can be enabled by the user).
- Removing an entire integration via CLI.
- Incremental (non-rebuild) sync.
