# Election Core Spec (Phase 1)

Source: `FULL_PLAN.md` §§ 1-2, 13-14, 20 + `README.md` Election Core.

## Entities

- `Election{id, name, date, seats?, status: draft|open|closed|audited}`
- `District{id, electionId, name, seats}`
- `PollingStation{id, districtId, name, registeredVoters, status: closed|open}`
- `Candidate{id, electionId, districtId?, name, party}`
- `Officer{id, stationId, role: presiding|deputy|observer, pubkeyRef}`

## Rules

1. Identity DB and ballot DB are separate. Join `voter → vote` MUST be impossible by schema (no FK, no shared IDs).
2. Station open requires 2-of-3 officer approvals; close requires 3 signatures; result export requires 2. Record approvals in audit log.
3. Reconciliation at close: `authorized == electronic == paper + unused + invalid` within tolerance else `exception`.
4. Offline-first: all station ops work without network; sync later as signed packages.

## Minimal prototype tables (JSON/Postgres later)

Same shapes as `services/election-core/src/types.ts`.
