# Supply-Chain Review V1

## Dependency surface (minimal by design)

- Runtime: ZERO third-party packages. Only `node:crypto`, `node:fs`, `node:path`, `node:test`, `node:assert`.
- Dev: `typescript ^5.6.0`, `@types/node ^22.0.0` (+ transitive, locked in `package-lock.json`).
- `npm audit` (2026-10-03): 0 vulnerabilities, prod and dev.
- Toolchain pinned: Node v24.11.0, npm 11.6.1, tsc 5.9.3 (`docs/security/baseline.md`).

## Policy

- No new runtime dependency without justification in the PR (security-first per README).
- `package-lock.json` is committed; upgrades re-run `npm audit` + full `npm test`.
- Build is `tsc` only — no bundlers, no postinstall scripts (verify: no `postinstall` in `package.json`).
- `dist/` and `node_modules/` are build artifacts, never reviewed as source.

## SLSA / provenance note (for Phase 6)

- No SLSA/provenance attestations in V1. The path there is short by design:
  zero runtime deps means attesting the build is attesting `tsc` + Node.
- What independent review must still demand: reproducible `npm ci` from the
  lockfile (verify byte-identical `dist/` across two machines), pinned-runner
  CI emitting provenance, and a lockfile-change review rule (every transitive
  bump re-runs audit + full suite before merge).
