# Security Policy — MVE (Research / Prototype)

> **NOT FOR REAL ELECTIONS.** Do not deploy for any official electoral process.

## Report a vulnerability

Do NOT open a public GitHub issue with exploit details.

- Email the maintainer privately with: affected component, version/commit, reproduction steps, impact.
- Allow reasonable time for triage before any disclosure.
- Do not attempt to: interfere with real elections, attack real election infrastructure, collect real voter data, or de-anonymize ballots.

## Scope

Research prototype covering: election-core, eligibility/ballot separation, result signing (Ed25519 + SHA-256), hash-chained audit logs, transparency API, simulators.

All crypto must use standard primitives; no proprietary crypto. Security-critical changes require >1 reviewer.

See `docs/security/threat-model.md` and `README.md#security-disclosure`.
