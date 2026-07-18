# Partnerships

Founder-to-founder pitches and one-pagers for collab targets where Moltypass slots into someone else's product *as resilience or installation hygiene*, not as a competitor.

## Active pitches

| Target | Their pain | Our ask | Status |
|---|---|---|---|
| [Composio](composio.md) | Centralized credential broker; May 2026 incident exposed structural risk | Build "Local Vault mode" adapter — credentials stay on customer machine | Draft, pre-warm-intro |
| [Hermes Forge](hermes.md) | Their own agent recommends `~/.hermes/.env` in our PROBLEM.md exhibit | Add `hermes` to tool-aware CLI catalog; appear in their install docs | Draft, pre-warm-intro |

## Pitch principles

1. **Lead with their pain, not our feature.** Every pitch opens with what's broken in *their* world.
2. **Asymmetric ask.** We do the engineering on both sides. Their cost is one doc line and a call.
3. **Co-launch, not feature.** Position as a joint security-architecture story, not a tools-list bullet.
4. **Founder-to-founder, never deck-driven.** Colin sends via warm intro. No PDF until they ask.
5. **Don't pitch as competitors.** Composio = orchestration layer; Moltypass = credential layer. Hermes = agent; Moltypass = credential layer. We slot in, we don't displace.
6. **Open source as trust signal.** MIT license + documented vault format = no lock-in objection.

## Targets we haven't drafted yet

- **Continue.dev** — same shape as Hermes; their `~/.continue/.env` flow is the same problem.
- **Cursor / Cline / Aider** — all have an "enter your API key" install step that could route through Moltypass.
- **Together / Groq / Fireworks / Nebius** — provider-side: their docs could recommend Moltypass for storing the keys they issue.
- **1Password** — long-term: their CLI handles passwords broadly; we could be the AI-keys-specific spec they don't want to write.
