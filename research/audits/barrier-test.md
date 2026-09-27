# Adversarial Barrier Test (FULL_PLAN §45) — 2026-09-27

Method: `research/simulations/barriers.ts` defeats ONE barrier per scenario on
throwaway election roots; a DIFFERENT barrier must catch it. Run: `npm run barriers`.

| # | barrier defeated | attack | catching barrier | result |
|---|---|---|---|---|
| b1 | identity controls | smuggled ballot, no voter behind it | reconciliation + paper check | DETECTED — `EXCEPTION: electronic=1 != paper=0` |
| b2 | ballot privacy | dump every store, join voter→choice | structural separation | DETECTED — no store links identity to choice |
| b3 | physical record | destroy paper slips after voting | close-time reconcile | DETECTED — close refused, nothing signed |
| b4 | audit log | drop an event from the chain file | hash-chain verification | DETECTED — broken at seq 2 |
| b5 | cryptographic verification | edit published counts in place | hash recomputation | DETECTED — mismatch |
| b6 | observer visibility | delete a reported case file | audit-receipt cross-check | DETECTED — `INC-0001` exposed by its receipt |

Score: **6/6 defeats detected, each by a control other than the defeated one.**
A corrupt actor must therefore defeat several independent systems at once —
and each defeat leaves evidence in a store owned by a different role.
Rerun on every release; any MISS becomes a filed follow-up, never a silent fix.
