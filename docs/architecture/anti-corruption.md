# Anti-Corruption Trace (six-barrier model — see README Core Principles)

Design goal: no single person, machine, database, party, administrator, or
vendor can change the outcome without detection. Each barrier maps to code:

1. **Identity controls** — eligibility separated from ballots; double-vote and
   replay blocked (`services/eligibility`, `services/ballot`; `security.e2e.test.ts`).
2. **Ballot privacy** — no voter→choice mapping exists anywhere; join-check lint
   plus data-level scans (`scripts/check-privacy.js`, `tests/paper.test.ts`).
   Nothing to steal, nothing to sell: receipts prove participation, never choice.
3. **Physical record** — voter-verifiable slips; close refuses on any
   paper↔electronic gap; independent recount tool (`voting/client`,
   `voting/verification`; 200-station pilot report in `research/audits/pilot-200.md`).
4. **Audit system** — hash-chained event log, RLA sampling, incident workflow
   that can investigate but never rewrite results (`services/audit`, `services/incidents`).
5. **Cryptographic verification** — Ed25519-signed packages + SHA-256 hashes;
   any `201→301` edit breaks verification (`services/results`; fuzz + failure tests).
6. **Independent observers** — read-only event/result/incident views, no PII
   (`transparency -- observe`; `docs/legal/institutions.md` for the human side).

A corrupt actor must defeat several of these simultaneously — and each defeat
leaves evidence in a different store owned by a different role.
