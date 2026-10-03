# MVE Open Election Dataset (§42 — research simulation, NOT a real election)

Published per-station results anyone can download and independently verify.
Contains **no personal data**: no voter IDs, no tokens, no blindings, no
reporters, no private keys — only station totals, hashes, signatures, and
audit/incident metadata.

## Files

| file | rows | contents |
|---|---|---|
| `results.csv` | 200 stations | per-station tallies + `result_hash` + Ed25519 `signature` (full fidelity: anyone can rebuild the canonical package and recompute the hash) |
| `stations.csv` | 200 stations | station → district/device/registered/status |
| `districts.csv` | 1 district | district → election/seats |
| `audit-results.csv` | 200 stations | station → audit status + result hash |
| `incidents.csv` | header only | no incidents in this run (clean simulation) |
| `revoked.csv` | header only | no revoked devices in this run |

Totals: party_a=3,068 · party_b=2,931 · party_c=2,991 (8,990 ballots).

## How it was generated (reproducible)

```bash
npm run build
node dist/research/simulations/simulate.js --stations 200 --voters 50 --seed 20260923 --paper --data /tmp/mve-data
npm run transparency -- export-all --dir open-data --data /tmp/mve-data
```

Same seed ⇒ same tallies (deterministic turnout model). The paper slips live
only in the scratch `--data` dir (choice-bearing analogues, never published);
only these six CSVs are committed.

## How to verify (no trust in this repo required)

```bash
node apps/verification/verify-bundle.js --dir open-data
# expect: stations=200 INVALID=0, TOTALS party_a=3,068 party_b=2,931 party_c=2,991
```

The checker is ~160 dependency-free lines: it recomputes every `result_hash`
from the row's own fields and confirms each counted total equals its per-choice
sum. With `--pubkeys <dir>` it additionally verifies every Ed25519 signature.
