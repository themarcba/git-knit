# Design: `git knit strand`

## Purpose

Start a new dependency branch and wire it into the current integration in one
step. From an integration branch (e.g. `big-feature`), `strand` branches a fresh
strand off the mainline, records it as a dependency, and checks it out so you can
begin working immediately.

## Command

```
git knit strand <branch> [--from <ref>]
```

- `<branch>` — the new strand branch to create.
- `--from <ref>` — where to branch from; defaults to `main` (or `master`).

## Behavior

Run while on an integration branch, `strand` does, in order:

1. **Guard** — refuse if there are uncommitted changes to *tracked* files (the
   same check `sync` uses; the knit config lives in `.git`, so it never trips
   this). Untracked files are safe and carried over the checkout.
2. **Resolve the integration** = the current branch.
3. **Resolve the from-ref** = `--from` if given, else `main`/`master` (via the
   existing `defaultBase` logic). Error if it doesn't exist.
4. **Validate the new branch** — error if `<branch>` already exists locally, or
   equals the current branch.
5. **Handle a non-integration current branch** — if the current branch isn't in
   the config yet, **warn and prompt**: "Make `<branch>` a git-knit
   integration? [y/N]". On yes it is created with base defaulting to
   `main`/`master`. On no → cancel cleanly (exit 0). In `--no-interactive` mode
   there is no prompt → error.
6. **Create + check out** the new branch: `git checkout -b <branch> <from-ref>`.
7. **Record the dependency** in the config (append `<branch>` to the
   integration's `depends_on`).
8. Report what happened and that you are now on the new branch.

No sync is run — a brand-new strand is identical to its from-ref, so folding it
into the integration would change nothing, and you have already left the
integration branch. Run `git knit sync` later once the strand has real commits.

## Implementation

Mirror the existing "testable core + thin CLI wiring" pattern.

### `src/commands/strand.ts` (new)

```ts
export interface StrandOptions {
  ui: Ui;
  confirmCreateIntegration: (integration: string) => Promise<boolean>;
  from?: string;
}
export type StrandResult =
  | { status: "ok"; branch: string; integration: string; created: boolean; from: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function strand(
  ctx: Ctx,
  branch: string,
  opts: StrandOptions,
): Promise<StrandResult>;
```

Does all validation, the `git checkout -b`, and the config write (reusing
`addDependency` / `writeConfig` and `defaultBase`). The confirm prompt is
**injected** so tests drive it without a TTY — mirroring how
`configureInteractive` takes a `ChoiceSelector` and `syncIntegration` takes
`onConflict`.

Ordering for safety: validate everything (including computing the next config via
`addDependency`, which throws on a stale duplicate) **before** any mutation; then
`checkout -b`; then `writeConfig`.

### `src/ui/prompt.ts`

Add `makeConfirmPrompt(interactive)` returning `async (question) => boolean`
(`y`/`yes` → true, else false; non-interactive → false), with bounded retries
like `makeConflictPrompt`.

### `src/cli.ts`

Register the `strand` command: `.argument("<branch>")`, `.option("--from <ref>")`,
wired through `guard(...)`, building `confirmCreateIntegration` from
`makeConfirmPrompt(ctx.interactive)`. The CLI layer maps `StrandResult` to output
and exit codes.

## Edge cases

| Situation | Behavior |
|---|---|
| Uncommitted tracked changes | Error: "You have uncommitted changes; commit or stash first" |
| `<branch>` already exists locally | Error: `branch "<branch>" already exists` |
| `<branch>` equals current branch | Error: a strand can't be the integration itself |
| `--from` ref doesn't exist | Error: `from ref "<ref>" not found` |
| No `--from` and no `main`/`master` | Error: "Could not determine a branch to strand from; pass --from <ref>" |
| Current branch not yet an integration | Warn + prompt; `n`/non-interactive → cancel/error |
| `<branch>` already a dependency (stale config, branch deleted) | `addDependency` throws → error, before any mutation |

## Result reporting

- `ok` + `created: true` → "created integration …", then added / stranded / now-on lines.
- `ok` + `created: false` → "stranded … off `<from>`, added to `<integration>`, now on it".
- `cancelled` → info "cancelled", exit 0.
- `error` → `ui.fail(message)`, exit 1.

## Testing plan (TDD)

- Core `strand.ts` tests (via `createGit` on a temp repo): happy path creates
  branch off main + records dep + checks out; `--from` other ref; dirty tree
  errors; existing branch errors; missing from-ref errors; not-an-integration
  with confirm=yes creates it, confirm=no cancels.
- CLI test: `run(["strand", "small-fix"], dir)` end-to-end from a `big-feature`
  branch; `--from`; non-interactive on a new integration errors.
