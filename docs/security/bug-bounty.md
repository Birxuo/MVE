# Election Security Bug Bounty (draft — amounts indicative, in MAD)

Attack the research deployment before criminals attack a real one. Test ONLY
against the provided research environment — never real election infrastructure,
never real voter data (see `SECURITY.md`, Research Ethics in `README.md`).

## Scope

In scope: voting client, result signing/verification, audit chain, ledger,
transmission bundles, portals/API, ballot privacy (voter→choice unlinkability),
build/supply chain of this repo.

Out of scope: real election systems, third-party infrastructure, social
engineering of people, physical intrusion, denial-of-service endurance.

## Tiers

| severity | example | award |
|---|---|---|
| Critical | undetected vote alteration; voter→choice linkage; forged device signature verifies | 100,000 DH |
| High | double vote; replay accepted; audit chain tamper undetected | 50,000 DH |
| Medium | privilege escalation in portals; incident workflow bypass | 15,000 DH |
| Low | information leak without ballot impact; hardening gaps | 2,000 DH |

Duplicates share the award; first reporter wins. Reports must include
reproduction against a seeded research election (`npm run simulate` + steps).
Findings and fixes publish quarterly (FULL_PLAN §30: red-team transparency).
