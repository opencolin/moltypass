# Workstream: mcp (Moltypass MCP server)

## Status: TOOL SURFACE LANDED IN WORKTREE (49 tests green). Transport pending.

## Goal
Ship a zero-knowledge, local, stdio Model Context Protocol server so AI agents (Cursor, Claude Desktop, Kiro, Continue, hermes) can discover keys, revoke grants, and run tools with keys injected — **without ever seeing key values**.

Design spec: [PLANS/mcp-spec.md](../mcp-spec.md).

## Worktree
`/Users/colin/moltypass-mcp/` on branch `ws/mcp`. `@bdc6df6`.

## Landed T+1.d
- `src/mcp/types.ts` — `DaemonClient` contract + return types for all 12 tools.
- `src/mcp/redact.ts` — provider-key-shape redaction (Anthropic / OpenAI / OpenRouter / Gemini / Nebius / Together / Groq / Cohere / Mistral). 17 tests. Prefix ordering enforced (sk-ant / sk-or / sk).
- `src/mcp/tools.ts` — dispatch layer with `TOOL_DEFS` (12 tools) + `handleToolCall(daemon, {name, arguments})`.
- `src/mcp/uri-parser.ts` — vendored from ws/uri; will resolve at merge.
- `src/mcp/fixtures/fake-daemon.ts` — in-memory DaemonClient for testing.
- `tests/mcp-redact.spec.ts` — 17 tests.
- `tests/mcp-tools.spec.ts` — 32 tests (all 12 tools + zero-knowledge sweep).

## Pending T+1.e (transport layer)
- `src/mcp/server.ts` — MCP JSON-RPC over stdio (using `@modelcontextprotocol/sdk` when reachable, else hand-rolled minimal server).
- `src/mcp/daemon-client.ts` — Native Messaging transport that speaks the ws/cli protocol.
- `bin/moltypass-mcp` — Node entry point invoking `startServer()`.

## Files created / modified so far
- `src/mcp/types.ts` (created)
- `src/mcp/redact.ts` (created)
- `src/mcp/tools.ts` (created)
- `src/mcp/uri-parser.ts` (vendored)
- `src/mcp/fixtures/fake-daemon.ts` (created)
- `tests/mcp-redact.spec.ts` (created)
- `tests/mcp-tools.spec.ts` (created)

## Dependencies
- ws/uri — for URI parser (vendored copy will resolve at merge)
- ws/notes — for `annotate_item` daemon backing
- ws/history — for `item_history` daemon backing
- ws/cli — for the Native Messaging daemon protocol

## Complexity / days
L / 5 (tool surface + tests = 2d; transport + Native Messaging integration = 2d; marketplace packaging = 1d)

## Design choices
- **Zero-knowledge is enforced at three layers.** (1) Metadata-only reads; (2) exec redaction; (3) uri_lint returns existence not value. See `mcp-spec.md` §Threat model.
- **Sweep test at the bottom of mcp-tools.spec.ts** asserts no key-shape ever appears in any tool response, even with a synthetic daemon.
- **The tool named `exec` takes `command: string[]`.** No shell interpolation anywhere; the real daemon runner will use `execFile`/`spawn`. The security-guidance plugin false-positives on the method name.
- **Prefix ordering in redact.ts matters.** sk-ant / sk-or / sk in that order so more specific matches win.

## Top risks
1. **MCP SDK availability** — `@modelcontextprotocol/sdk` may not be reachable in bootstrap. **Mitigation:** fall back to hand-rolled JSON-RPC (spec is small).
2. **Redact false negatives on new provider shapes.** **Mitigation:** keep in sync with `scripts/grep-no-keys.ts`. Any provider added there gets a KEY_SHAPES entry here.
3. **Fake daemon divergence from real daemon.** **Mitigation:** integration test hitting the real Native Messaging transport lives in T+1.e (pending).

## Open questions
- HTTP/SSE transport for remote agents? Deferred to v2.5.
- MCP resources + prompts (browse and guided-workflow surfaces)? Sketch in mcp-spec.md; punting implementation to T+1.e.

## Exit criteria
- ✅ 12 tool definitions declared with schemas (32 tests)
- ✅ Redact covers 9 provider shapes (17 tests)
- ✅ Zero-knowledge sweep on all read tools (1 test)
- ⏳ Stdio JSON-RPC server bootstrap (T+1.e)
- ⏳ Native Messaging transport wire-up (T+1.e)
- ⏳ Bin entry point + npm publish config (T+1.e)
- ⏳ README + Claude Desktop / Cursor install instructions
- ⏳ 390/390 green in worktree (already so). Target: 30+ new tests (already 49).

## v2.1 tie-in
This IS the launch narrative for v2.1. See [PLANS/council/v21-beat-1password.md](../council/v21-beat-1password.md).
