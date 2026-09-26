# Database Separation V1

Five logical DBs (can be 5 schemas in Postgres in prod; JSON files in prototype):

1. `identity` — `voters(voter_id PK, district, station, eligible, status)` — NEVER stores choices.
2. `election` — `elections, districts, stations, candidates, officers`.
3. `voting` — `ballots(ballot_id PK, token_hash UNIQUE, station, choice, ts)` — NO voter_id column by design.
4. `audit` — `events(seq PK, ts, type, station, device, payload, prev_hash, hash, sig)`.
5. `transparency` — materialized public view: station totals, hashes, signatures, audit status. No PII.

Enforcement: code review must reject any PR adding `voter_id` to `voting.ballots` or `choice` to `identity.voters`.
Lint rule (future): grep `voter.*vote|CIN.*candidate` in `services/ballot`.
