# git-knit

Compose multiple independent branches into a single, rebuildable **integration
branch**.

Unlike stacked-branch tools that treat branches as an ordered stack,
`git-knit` treats your branches as independent strands and weaves them
together: it starts from a base branch and merges each dependency branch into a
generated integration branch. That integration branch is a disposable artifact —
you can always rebuild it from scratch.

```
main ──┬── fix-a ──────╮
       ├── adjustment-b ┤──▶  git knit sync  ──▶  big-feature
       └── cleanup-c ───╯
```

## Install

```bash
npm install -g git-knit
```

This installs a `git-knit` binary, which Git exposes as the subcommand
`git knit`.

## The mental model

- You declare, in a committed `.knit.json`, that an integration branch is
  built from a **base** plus a list of **dependency branches**.
- `git knit sync` **rebuilds** the integration branch: it resets to the base,
  then merges each dependency in order.
- Because sync rebuilds from scratch, the integration branch is reproducible.

> **Rule:** commit your work on the dependency branches, never directly on the
> integration branch. The integration branch is generated — a `sync` will
> overwrite it. (If you do leave stray commits on it, `sync` refuses unless you
> pass `--force`.)

## Config

`.knit.json` at the repository root (commit it):

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

- `base` is required per integration.
- One file can declare many integrations.
- The integration branch name is the key (`big-feature`).

## Commands

```
git knit init [integration] [base]     scaffold .knit.json
git knit add [integration] <branch>    add a dependency (--base <ref> when new)
git knit remove [integration] <branch> remove a dependency
git knit sync [integration] | --all    rebuild the integration branch(es)
git knit status [integration]          show dependencies and drift
git knit list                          list all integrations
```

### Working from the current branch

`add`, `remove`, `sync`, and `status` default the integration to **the branch
you have checked out**, so you can drop the name once you're on it:

```bash
git checkout big-feature
git knit add fix-a       # adds fix-a to big-feature
git knit remove fix-a    # removes it
git knit sync            # rebuilds big-feature
git knit status          # status of big-feature
```

Pass an explicit name to act on a different integration (`git knit sync
other-feature`, `git knit add big-feature fix-a`). `status` with no name and
a non-integration branch checked out falls back to showing every integration.

### Example

```bash
# scaffold and describe the integration
git knit init big-feature main
git knit add big-feature fix-a
git knit add big-feature cleanup-c
git add .knit.json && git commit -m "describe big-feature integration"

# build it
git knit sync big-feature

# later, after fix-a gains new commits
git knit status big-feature   # → out of date, fix-a has new commits
git knit sync big-feature     # rebuild
```

### Conflicts

If merging a dependency conflicts, `sync` stops and asks:

```
  Conflict merging cleanup-c. [r]esolve manually or [a]bort?
```

- **resolve** — leaves the conflict in your working tree so you can fix it with
  normal git tools, commit, and re-run `sync`.
- **abort** — restores the integration branch to exactly where it was before the
  sync, leaving nothing half-built.

In non-interactive contexts (CI, pipes, or `--no-interactive`), sync always
aborts on conflict.

## Flags

- `--no-interactive` — never prompt; abort on conflict.
- `--force` — allow `sync` to overwrite an integration branch that has manual
  commits.
- `--debug` — print stack traces on error.

Output is colorized on a TTY and degrades to plain text when piped or when
`NO_COLOR` is set.

## Scope (v1)

- Uses **local** branch heads only — run your own `git pull`/`fetch` to update
  dependency branches before syncing.
- Composition is by **merge** (not rebase/cherry-pick).
- Remote refs, automatic conflict-resolution replay, and CLI removal of a whole
  integration are intentionally out of scope for now.

## License

MIT
