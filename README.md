# git-assemble

Compose multiple independent branches into a single, rebuildable **integration
branch**.

Unlike stacked-branch tools that treat branches as an ordered stack,
`git-assemble` treats your branches as independent strands and weaves them
together: it starts from a base branch and merges each dependency branch into a
generated integration branch. That integration branch is a disposable artifact —
you can always rebuild it from scratch.

```
main ──┬── fix-a ──────╮
       ├── adjustment-b ┤──▶  git assemble sync  ──▶  big-feature
       └── cleanup-c ───╯
```

## Install

```bash
npm install -g git-assemble
```

This installs a `git-assemble` binary, which Git exposes as the subcommand
`git assemble`.

## The mental model

- You declare, in a committed `.assemble.json`, that an integration branch is
  built from a **base** plus a list of **dependency branches**.
- `git assemble sync` **rebuilds** the integration branch: it resets to the base,
  then merges each dependency in order.
- Because sync rebuilds from scratch, the integration branch is reproducible.

> **Rule:** commit your work on the dependency branches, never directly on the
> integration branch. The integration branch is generated — a `sync` will
> overwrite it. (If you do leave stray commits on it, `sync` refuses unless you
> pass `--force`.)

## Config

`.assemble.json` at the repository root (commit it):

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
git assemble init [integration] [base]     scaffold .assemble.json
git assemble add [integration] <branch>    add a dependency (--base <ref> when new)
git assemble remove [integration] <branch> remove a dependency
git assemble sync [integration] | --all    rebuild the integration branch(es)
git assemble status [integration]          show dependencies and drift
git assemble list                          list all integrations
```

### Working from the current branch

`add`, `remove`, `sync`, and `status` default the integration to **the branch
you have checked out**, so you can drop the name once you're on it:

```bash
git checkout big-feature
git assemble add fix-a       # adds fix-a to big-feature
git assemble remove fix-a    # removes it
git assemble sync            # rebuilds big-feature
git assemble status          # status of big-feature
```

Pass an explicit name to act on a different integration (`git assemble sync
other-feature`, `git assemble add big-feature fix-a`). `status` with no name and
a non-integration branch checked out falls back to showing every integration.

### Example

```bash
# scaffold and describe the integration
git assemble init big-feature main
git assemble add big-feature fix-a
git assemble add big-feature cleanup-c
git add .assemble.json && git commit -m "describe big-feature integration"

# build it
git assemble sync big-feature

# later, after fix-a gains new commits
git assemble status big-feature   # → out of date, fix-a has new commits
git assemble sync big-feature     # rebuild
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
