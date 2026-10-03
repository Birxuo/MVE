# Institutional Separation (research draft)

No single institution should control the election. The Constitution frames free,
sincere, transparent elections with neutral observation; the prototype mirrors
that separation in roles and tooling:

| function | owner (proposed) | repo surface |
|---|---|---|
| Election administration (config, stations, candidates) | Election authority | `manage` CLI (`services/election-core`) |
| Polling-station operation | Presiding officers + party reps (multi-sig) | `station` CLI (`voting/client`), 2-of-3 open / 3-of-3 close |
| Security certification (devices, firmware, crypto) | Independent cybersecurity authority | `docs/security/*`, firmware gate in `voting/client/src/device.ts` |
| Privacy oversight | CNDP | `docs/privacy/law-09-08-review.md`, privacy lint |
| Dispute adjudication | Courts | Incident case files (`services/incidents`) as evidence input — the system never adjudicates itself |
| Independent observation | Accredited observers | `transparency -- observe` (event chain + results + incident counts, no PII) |

Enforcement notes: multi-sig thresholds are coded, not policy memos
(`openMachine`/`closeMachine` throw below quorum); observer paths are
read-only by construction (no write imports); AI flags never decide
(`flagAnomalies` → human triage only).
