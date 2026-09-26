# Supply-Chain Review V1

## Dependency surface (minimal by design)

- Runtime: ZERO third-party packages. Only `node:crypto`, `node:fs`, `node:path`, `node:test`, `node:assert`.
- Dev: `typescript ^5.6.0`, `@types/node ^22.0.0` (+ transitive, locked in `package-lock.json`).
- `npm audit` (2026-09-26): 0 vulnerabilities, prod and dev.

## Policy

- No new runtime dependency without justification in the PR (security-first per README).
- `package-lock.json` is committed; upgrades re-run `npm audit` + full `npm test`.
- Build is `tsc` only — no bundlers, no postinstall scripts (verify: no `postinstall` in `package.json`).
- `dist/` and `node_modules/` are build artifacts, never reviewed as source.

## Residual risks

- TypeScript compiler supply chain (accepted; reproducible via lockfile + `npm ci`).
- Node.js toolchain (pinned version recorded in `docs/security/baseline.md`).
- No SLSA/provenance attestations in V1 — noted for Phase 6 independent review.
