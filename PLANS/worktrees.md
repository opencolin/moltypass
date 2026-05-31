# Worktree map

Each parallel workstream lives in its own sibling worktree so the main checkout stays clean.

## Layout

```
/Users/colin/
├── moltypass/            ← main worktree, branch: main
│   └── PLANS/            ← planning state (this dir)
├── moltypass-audit/      ← branch: ws/audit          (spin in W1)
├── moltypass-revoke/     ← branch: ws/revoke         (spin in W2)
├── moltypass-detector/   ← branch: ws/detector       (spin in W2)
├── moltypass-picker/     ← branch: ws/picker         (spin in W3, after detector lands)
├── moltypass-leak/       ← branch: ws/leak           (spin in W3, after revoke lands)
├── moltypass-auth/       ← branch: ws/auth           (spin in W2, co-developed with dashboard)
├── moltypass-dashboard/  ← branch: ws/dashboard      (spin in W2, co-developed with auth)
├── moltypass-enterprise/ ← branch: ws/enterprise-sw  (spin in W4)
├── moltypass-security/   ← branch: ws/security       (spin in W5)
└── moltypass-release/    ← branch: ws/release        (spin in W6)
```

## Spin command (template)

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

Worktrees merge into `main` in critical-path order. Each merge:
1. Run `pnpm typecheck` in the source worktree.
2. Rebase the worktree branch onto `main`.
3. `git push` (or merge locally).
4. Tear down worktree.
5. Update `PLANS/STATE.md` and `PLANS/LOG.md`.
6. Cut release tag if a release boundary is reached.

## Current state

No worktrees spun yet. PM council deciding which to spin first; default order is `audit` then `revoke`+`detector` in parallel.
