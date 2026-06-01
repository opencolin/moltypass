# Worktree map

Each parallel workstream lives in its own sibling worktree so the main checkout stays clean.

## Council-decided spin order

**Wave 1 (NOW, T+1):** test-infra + audit + security
**Wave 2 (after audit lands):** detector + revoke (both depend on audit)
**Wave 3 (after detector lands):** picker (shares src/background/capture.ts with detector)
**Wave 4 (W6):** release

## Layout

```
/Users/colin/
├── moltypass/                  ← main worktree, branch: main, PLANS/
├── moltypass-test-infra/       ← branch: ws/test-infra (W1, foundation)
├── moltypass-audit/            ← branch: ws/audit       (W1, foundation)
├── moltypass-security/         ← branch: ws/security    (W1, foundation)
├── moltypass-detector/         ← branch: ws/detector    (W3, after audit)
├── moltypass-revoke/           ← branch: ws/revoke      (W3, after audit)
├── moltypass-picker/           ← branch: ws/picker      (W4, after detector)
└── moltypass-release/          ← branch: ws/release     (W6)
```

## Spin command

```bash
cd /Users/colin/moltypass
git worktree add ../moltypass-<ws> -b ws/<ws>
```

## Tear-down (after merge)

```bash
cd /Users/colin/moltypass
git worktree remove ../moltypass-<ws>
git branch -d ws/<ws>
```

## Merge order

Worktrees merge into `main` in critical-path order:
1. test-infra (must merge first — gate for all others)
2. audit
3. security (parallel with detector if both ready)
4. detector
5. revoke
6. picker
7. release

Each merge:
1. Run `pnpm test:gate` in the source worktree (typecheck + tests + grep-no-keys).
2. Rebase the worktree branch onto `main`.
3. Re-run `pnpm test:gate`.
4. `git push` / merge locally.
5. Tear down worktree.
6. Update `PLANS/STATE.md` and `PLANS/LOG.md`.
7. Cut release tag if a release boundary is reached.

## Current state

| Worktree | Branch | Status |
|---|---|---|
| moltypass-test-infra | ws/test-infra | IN_PROGRESS — spun T+1 |
| moltypass-audit      | ws/audit      | IN_PROGRESS — spun T+1 |
| moltypass-security   | ws/security   | IN_PROGRESS — spun T+1 |
