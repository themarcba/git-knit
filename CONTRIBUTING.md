# Contributing to git-knit

Thanks for taking the time to contribute! 🧶

## Getting started

git-knit is a TypeScript CLI. You'll need **Node.js 20+** and npm.

```bash
git clone https://github.com/themarcba/git-knit.git
cd git-knit
npm install
```

## Development workflow

| Command             | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm test`          | Run the test suite once (Vitest)                  |
| `npm run test:watch`| Run tests in watch mode                           |
| `npm run typecheck` | Type-check with `tsc` (no emit)                   |
| `npm run build`     | Bundle the CLI into `dist/` with tsup             |

To try your local build as a real `git` subcommand:

```bash
npm run build
npm link          # exposes `git knit` from your working copy
git knit --help
```

## Making changes

1. **Open an issue first** for anything non-trivial so we can agree on the
   approach before you invest time.
2. Create a branch off `main`.
3. Keep the change focused — one logical change per pull request.
4. **Add or update tests.** Bug fixes should come with a regression test;
   features need coverage for the new behavior.
5. Make sure the full check suite passes locally:

   ```bash
   npm run typecheck && npm test && npm run build
   ```

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add --all flag to sync
fix: survive EOF on the conflict prompt
docs: clarify base vs. dependencies
refactor: rename setup command to configure
```

## Pull requests

- Reference the issue your PR addresses.
- Describe the change and how you verified it.
- CI (type-check, tests, build across Node 20/22/24) must be green before merge.

## Code of Conduct

Be kind and respectful. We follow the spirit of the
[Contributor Covenant](https://www.contributor-covenant.org/).
