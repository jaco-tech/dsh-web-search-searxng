# Contributing

All changes go through **pull requests**. Direct pushes to `main` are blocked.

## Workflow

```bash
# 1. Create a worktree for your feature branch
git worktree add ../feature-branch feature-branch

# 2. Work in the worktree
cd ../feature-branch
git checkout -b feature/my-change
# ... make changes, commit ...

# 3. Push and open a PR
git push origin feature/my-change
gh pr create --fill

# 4. After PR is approved and merged, clean up
git worktree remove ../feature-branch
git branch -d feature/my-change
```

## Release process

After a PR merges to `main`, tag the release:

```bash
git checkout main
git pull
git tag v0.3.0
git push origin v0.3.0
```

The CI workflow builds across Node 22, 24, 26, and publishes to npm automatically on tag pushes.

## CI checks

Before opening a PR, make sure:

```bash
npm install
npm run build     # TypeScript compilation
```

The CI runs the same check across Node 22, 24, and 26. All three must pass before a PR can merge.