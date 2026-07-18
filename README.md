<h1 align="center">🧶 git-knit</h1>

<p align="center">
  Compose multiple independent branches into a single, rebuildable <strong>integration branch</strong>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/git-knit"><img src="https://img.shields.io/npm/v/git-knit.svg?color=cb3837&logo=npm" alt="npm version"></a>
  <a href="https://github.com/themarcba/git-knit/actions/workflows/ci.yml"><img src="https://github.com/themarcba/git-knit/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/themarcba/git-knit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white" alt="Node.js >=20">
</p>

---

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

- You declare, in a local config, that an integration branch is built from a
  **base** plus a list of **dependency branches**.
- `git knit sync` **rebuilds** the integration branch: it resets to the base,
  then merges each dependency in order.
- Because sync rebuilds from scratch, the integration branch is reproducible.

> **Rule:** commit your work on the dependency branches, never directly on the
> integration branch. The integration branch is generated — a `sync` will
> overwrite it. (If you do leave stray commits on it, `sync` refuses unless you
> pass `--force`.)

## Base vs. dependencies

These are two different roles:

- **The base** (usually `main`) is the *foundation* the integration is rebuilt
  on. Every `sync` starts by resetting the integration branch to the **current
  tip of the base**, so the base is **always included and always up to date** —
  you never add or remove it. That's why `git knit configure` shows the base pinned
  at the top, dimmed and non-selectable: it's not optional.
- **Dependencies** are the branches you *choose* to weave in **on top of** the
  base. These are what the `configure` checkboxes and `add`/`remove` control.

Concretely, `git knit sync big-feature` runs:

```bash
git checkout -B big-feature main   # reset to the latest base
git merge fix-a                    # then merge each dependency, in order
git merge cleanup-c
```

If the base gains new commits, `git knit status` shows the base row as out of
date and the next `sync` picks them up automatically.

## Config

The config lives at **`.git/knit.yaml`** — inside the git directory, so it is
**local to your clone**: it never appears in `git status`, is never committed,
and is not shared with teammates. Nothing for you to manage; the first `add` or
`configure` creates it. In a worktree it is stored in the shared (common) git
directory, so all worktrees of a repo see the same integrations.

```yaml
integrations:
  big-feature:
    base: main
    depends_on:
      - fix-a
      - adjustment-b
      - cleanup-c
```

- `base` is required per integration.
- One file can declare many integrations.
- The integration branch name is the key (`big-feature`).

## Commands

```
git knit configure [integration]        interactively pick which branches to include
git knit add [integration] <branch>     add a dependency (--base <ref> when new)
git knit remove [integration] <branch>  remove a dependency
git knit strand <branch> [--from <ref>] start a new dependency branch and switch to it
git knit sync [integration] | --all     rebuild the integration branch(es)
git knit status [integration]           show dependencies and drift
git knit list                           list all integrations
```

There is no separate init step: `add` and `configure` create the integration (and
the config file) the first time you use them. A new integration's base defaults
to `main` (or `master`); pass `--base <ref>` to choose another.

### Interactive configuration

`git knit configure` opens a checkbox editor of your branches for an integration.
Branches already in the list come **pre-checked**; toggle with `<space>`
(check to add, uncheck to remove) and press `<enter>` to apply:

```bash
git checkout big-feature
git knit configure            # create/edit big-feature's branches
git knit configure other      # or name a different integration
```

The base is shown pinned at the top, dimmed and non-selectable, for context. The
integration branch itself and the branch you're on are never offered, and an
existing dependency stays listed even if its branch was deleted, so you can
still remove it.

### Starting a new strand

`git knit strand` is the quick way to spin up a fresh dependency branch while
you're on an integration. From `big-feature`:

```bash
git checkout big-feature
git knit strand small-fix        # branch small-fix off main, add it, switch to it
```

In one step it:

1. branches `small-fix` off `main` (or `master`) — pass `--from <ref>` to
   branch from somewhere else,
2. adds `small-fix` as a dependency of `big-feature`, and
3. checks out `small-fix` so you can start working immediately.

No sync runs — a brand-new strand is identical to its starting point, so there
is nothing to weave in yet. Once `small-fix` has commits, `git knit sync
big-feature` folds them in.

If the branch you're on isn't an integration yet, `strand` warns and asks
whether to make it one (declining leaves everything untouched). It refuses when
you have uncommitted changes to tracked files, when the new branch already
exists, or when `--from` names a ref that doesn't exist.

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
# describe the integration (config is created on first use, at .git/knit.yaml)
git knit add big-feature fix-a       # base defaults to main; --base to override
git knit add big-feature cleanup-c

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

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set
up the project, run the tests, and open a pull request. Notable changes are
tracked in the [CHANGELOG](CHANGELOG.md).

## License

[MIT](LICENSE) © [Marc Backes](https://github.com/themarcba)
