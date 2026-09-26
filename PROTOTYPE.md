# Prototype Run Guide (V1)

> Research only — NOT for real elections.

## Prereqs

Node 20+, npm.

## Commands

```bash
npm install
npm run build
npm test              # 16 tests: adversarial + file-store + incidents + fuzz
npm run typecheck       # strict, no emit
npm run audit           # npm audit --omit=dev (baseline: 0 vulns, see docs/security/baseline.md)
npm run lint:privacy  # ensures ballot/results/transparency carry no voter identity
npm run simulate      # 10 Tangier stations x 50 voters (persists to data/)
npm run simulate:100  # 100 stations x 200 voters scale test
npm run manage -- seed-demo --stations 3 --voters 10   # file-store setup
npm run manage -- status
npm run transparency -- verify          # hash check (sig when --pubkey given)
npm run transparency -- export-csv --out results.csv
npm run transparency -- observe --station TANGER-ASilah-0001  # observer view
npm run incidents -- report --station TANGER-ASilah-0001 --category ballot-issue --description "..."
npm run incidents -- triage --id INC-0001 --decision investigating --note "..."
npm run simulate -- --anomalies         # inject 99% turnout → auto triaged incident
npm run failures                          # 5 failure scenarios (drop/tamper/outage/corrupt-device/duplicate)
npm run failures -- --only tamper         # single scenario
npm run recover                            # DR drill: rebuild aggregate from station copies
npm run station -- open --station X --approvals presiding,observer
npm run station -- vote --station X --voter V --choice party_a
npm run station -- close --station X --approvals presiding,deputy,observer
npm run verify-paper [--station X] [--sample N]   # paper↔electronic↔published recount
```

## What runs

`research/simulations/simulate.ts`:
open (2-sig) → authorize (single-use token, VOTED flag) → cast (no voterId stored)
→ tally → `signResult` (Ed25519+SHA-256) → reconcile → close (3-sig) → RLA sample → public CSV.

Tamper demo covered in tests: `201→301` breaks `result_hash` verification.

## Layout

- `services/election-core/` types + `crypto-utils` (canonical JSON, sha256, receipts)
- `services/eligibility/` double-vote guard
- `services/ballot/` anonymous cast, replay guard
- `services/results/` tally + sign/verify
- `services/audit/` hash-chain, reconcile, RLA sampler, anomaly flags
- `services/transparency/` public view + CSV + `observe`
- `services/incidents/` report → triage → resolve workflow (metadata only)
- `voting/client/` polling-station machine: open (firmware gate, 2-sig) → vote (slip) → close (3-sig, reconcile-or-refuse)
- `voting/verification/` paper↔electronic↔published recount (`research/audits/pilot-200.md`)
- `docs/` specs: `architecture/election-core.md`, `architecture/management-api.md`, `architecture/observer-incidents.md`, `cryptography/protocol.md`, `security/threat-model.md`, `security/baseline.md`, `security/crypto-review.md`, `security/supply-chain.md`, `architecture/database.md`, `auditing/risk-limiting-audit.md`
