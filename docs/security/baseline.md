# Security Baseline (pinned 2026-09-26)

> Re-run after any dependency or toolchain change.

## Toolchain

- Node: v24.11.0
- npm: 11.6.1
- Deps (runtime): ZERO — `node:crypto`, `node:fs`, `node:path` only.
- Dev deps: `typescript ^5.6.0`, `@types/node ^22.0.0` (see `package-lock.json`).

## Audit (2026-09-26)

- `npm audit --omit=dev`: 0 vulnerabilities
- `npm audit` (incl. dev): 0 vulnerabilities

## Gates

```bash
npm run build          # tsc -p tsconfig.json (strict)
npm run typecheck      # tsc --noEmit, no build artifacts
npm test               # node --test over dist/tests
npm run lint:privacy   # no identity in ballot/results/transparency; no vote content in incidents
npm audit              # must stay 0 vulnerabilities
```

## Performance reference (2026-09-26, dev machine, Node v24.11.0)

| run | stations × voters | ballots | wall | max RSS |
|---|---|---|---|---|
| `simulate` default | 10 × 50 | ~450 | <2s | n/a |
| `--stations 100 --voters 50` | 100 × 50 | ~4,500 | 0.6s | n/a |
| `--stations 1000 --voters 50` | 1000 × 50 | ~45,000 | 5.0s | 234 MB |
| `--stations 10000 --voters 50` | 10000 × 50 | ~450,000 | 4m52s | 1.1 GB |

Streaming (`--flush-every 500`, per-station artifact writes) keeps 10k runs
completing on the dev machine. Peak memory is dominated by full-file
merge-parses of the growing voter/ballot JSON stores, not the window state —
further scale needs sharded/append-only stores (recorded future work, not V1).
Console CSV auto-suppresses over 200 stations (use `--out`).
