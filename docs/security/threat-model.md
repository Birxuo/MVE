# Threat Model V1

Source: `README.md` Threat Model.

## Assets

Election config, eligibility list, anonymous ballots, result packages, audit logs, device keys, transparency DB.

## Attackers

- External: network, malware, DDoS, supply-chain.
- Insider: corrupt officer/admin, stolen creds.
- Physical: theft, USB, tamper.
- Social: phishing, coercion/vote-buying.

## Assumptions / boundaries

1. Voting machines OFFLINE during voting; no USB/WiFi/BT in V1 simulator (enforced procedurally).
2. No single point of trust: open/close/export need multi-sig; no `CIN→vote` DB.
3. Paper record is independent evidence; electronic result alone is never official.
4. AI = flag only, never adjudicate.

## Must-test (maps to `tests/`)

Alter/duplicate/erase vote, firmware mod, officer impersonation, cred theft, result tamper, server loss, DB corruption, replay, outage (net/power).

## Out of scope V1

Phone voting, blockchain consensus, biometrics mandatory, facial-recognition everywhere.
