# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Added

- `git knit configure` — interactive checkbox editor to pick which branches an
  integration includes.
- `git knit add` / `git knit remove` — manage dependency branches, defaulting to
  the currently checked-out integration.
- `git knit sync` — rebuild an integration branch from its base plus each
  dependency, with `--all` to rebuild every integration at once.
- `git knit status` — show dependencies and drift, including an out-of-date base.
- `git knit list` — list all configured integrations.
- Local YAML config at `.git/knit.yaml`, shared across worktrees and never
  committed.
- Interactive conflict handling (resolve/abort) with safe rollback on abort, and
  a non-interactive mode that aborts on conflict.
- `--force`, `--no-interactive`, and `--debug` flags; colorized output that
  degrades gracefully when piped or when `NO_COLOR` is set.
