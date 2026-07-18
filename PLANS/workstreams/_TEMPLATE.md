# Workstream: <name>

## Status: TODO

## Goal
<one-sentence what this ships>

## Worktree
`/Users/colin/moltypass-<name>/` on branch `ws/<name>`.

## First file
`<absolute path to the first file this workstream creates>`

## Files to create
- `<path>` — <what it does>

## Files to modify
- `<path>` — <what changes>

## Dependencies
<other workstreams that must land first, or "None">

## Complexity / days
<S|M|L> / <days>

## Top risks
1. <risk>

## Open questions
- <question>

## Exit criteria
- <what must hold to merge back to main>
- `pnpm typecheck` green in worktree.
- `pnpm test` green in worktree.
- `pnpm test:gate` (typecheck + tests + key-shape grep) green.

## Tests target
<N> new tests

## v2.1 tie-in
<how this maps to the council-decided v2.1 theme>
