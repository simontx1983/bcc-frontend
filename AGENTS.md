# Instructions for Codex

Before working in this frontend repository, locate and read the umbrella
repository's AI guidance:

- In the full nested layout, read `../docs/ai/README.md`.
- In a flat standalone layout, read `../Blue-collar-crypto/docs/ai/README.md`.
- If neither local path is available, consult the canonical
  [umbrella AI guidance](https://github.com/simontx1983/Blue-collar-crypto/blob/main/docs/ai/README.md).

For frontend work, follow `CLAUDE.md` and `docs/frontend-doctrine.md` (especially
§5). Keep the frontend presentational: no business logic. Use the typed API
client for server communication; do not call raw `fetch()` elsewhere, and do
not use `any` or `as any`. Respect `prefers-reduced-motion`, including using
static states for structural motion.

Keep API usage and view models compatible with the umbrella repository's
`docs/api-contract-v1.md`. In a standalone or cloud checkout, consult that
contract in the umbrella repository when it is not present locally.
