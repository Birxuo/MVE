# Security Baseline (pinned 2026-09-26, self-pass 2026-10-03)

> Re-run after any dependency or toolchain change.

## Toolchain

- Node: v24.11.0
- npm: 11.6.1
- tsc: 5.9.3 (spec: `typescript ^5.6.0`, `@types/node ^22.0.0`, see `package-lock.json`)
- Deps (runtime): ZERO — `node:crypto`, `node:fs`, `node:path` only (`npm ls --omit=dev` prints empty).
- Dev deps: `typescript`, `@types/node` (+ transitive, locked in `package-lock.json`).
- No `postinstall`/install scripts in `package.json`.

## Audit (2026-10-03)

- `npm audit --omit=dev`: 0 vulnerabilities
- `npm audit` (incl. dev): 0 vulnerabilities

## Self-pass (2026-10-03, A6)

| gate | command | result |
|---|---|---|
| typecheck | `npm run typecheck` | clean |
| build | `npm run build` | clean |
| tests | `npm test` | 93/93 pass |
| privacy | `npm run lint:privacy` | OK |
| audit prod | `npm audit --omit=dev` | 0 vulnerabilities |
| audit dev | `npm audit` | 0 vulnerabilities |
| chaos drills | `npm run chaos` | 3/3 detected |
| barriers | `npm run barriers` | 6/6 detected |
| scale | 10k stations + paper | 12m31s, verify-paper 10000/10000 MATCH |

Scope honesty: this is a SELF pass by the prototype's authors — static/dynamic
analysis, pentest, hardware review, and every Phase 6 independent review remain
open (README roadmap). It gates further prototype work, never a pilot claim.

## Gates

```bash
npm run build          # tsc -p tsconfig.json (strict)
npm run typecheck      # tsc --noEmit, no build artifacts
npm test               # node --test over dist/tests
npm run lint:privacy   # no identity in ballot/results/transparency; no vote content in incidents
npm audit              # must stay 0 vulnerabilities
```

## Performance reference (2026-10-03, 4 vCPU / 3 GB RAM, Node v24.11.0)

| run | stations × voters | ballots | wall | max RSS | verified |
|---|---|---|---|---|---|
| `simulate` default | 10 × 50 | ~450 | <2s | n/a | chain ok |
| `--stations 100 --voters 50` | 100 × 50 | ~4,500 | 0.6s | n/a | chain ok |
| `--stations 1000 --voters 50` | 1000 × 50 | ~45,000 | 5.0s | 234 MB | chain ok |
| `--stations 10000 --voters 50` | 10000 × 50 | 449,898 | 10m41s | 1.14 GB | chain ok |
| `--stations 10000 --voters 50 --paper` | 10000 × 50 | 449,898 ×2 piles | 12m31s | 1.05 GB | `verify-paper --sample auto --ceremony …`: exit 0, 10000/10000 MATCH (100-station ceremony sample) |

(The 2026-09-26 10k row read 4m52s / 1.1 GB on a larger dev machine; the above
is a fresh re-run on the 3 GB box after the A1–C2 changes, which add per-ballot
commitments, signed sim events, and per-station device bindings.)

Streaming (`--flush-every 500`, per-station artifact writes) keeps 10k runs
completing on the dev machine. Peak memory is dominated by full-file
merge-parses of the growing voter/ballot JSON stores, not the window state —
further scale needs sharded/append-only stores (recorded future work, not V1).
Console CSV auto-suppresses over 200 stations (use `--out`).
