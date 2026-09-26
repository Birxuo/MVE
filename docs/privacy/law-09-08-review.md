# Privacy Review — Law 09-08 Mapping (research draft, NOT legal advice)

Morocco's Law 09-08 regulates personal-data processing; CNDP treats political
opinions as sensitive data and requires authorization for sensitive data, CIN
numbers, and certain interconnections. This note maps those duties to what the
prototype implements — and what a real deployment would still need.

## What the prototype implements

- **Purpose limitation / minimization.** Six separated file stores
  (`services/election-core/src/store.ts`): identity (status only), election,
  voting (token hashes only), audit (device events), transparency (totals),
  incidents (metadata only). No store holds more than its purpose requires.
- **Sensitive-data separation.** Political choices live only in the voting store
  and paper slips; voter identities live only in the identity store. The
  voter→choice join is structurally absent and enforced two ways:
  `scripts/check-privacy.js` (import join-check + paper-blind observer paths)
  and data-level scans (`tests/paper.test.ts`).
- **No CIN handling.** No module reads, stores, or transmits CIN numbers
  (forbidden pattern in privacy lint). Voter records use opaque local IDs.
- **Retention.** Prototype keeps everything under gitignored `data/`; there is
  no retention/deletion job — flagged below as a deployment requirement.

## Still required before any real deployment

- [ ] CNDP authorization for sensitive-data processing and any interconnections.
- [ ] Formal retention schedule + secure deletion procedure (currently absent).
- [ ] Data-subject rights procedure (access, rectification, objection).
- [ ] Independent privacy audit (README Phase 6).
- [ ] Biometric policy if ever introduced (currently deferred entirely).
