# Observer + Incidents (Phase 2 leftover)

Source: `FULL_PLAN.md` §§16–17, `README.md` Observer System + Incident Reporting.

## Workflow

```
Citizen / observer / detector
        ↓ report (open)
Case management — triage (investigating | dismissed, note required)
        ↓ evidence
Human investigation
        ↓ resolve (note required) | reopen → triaged
Decision (published metadata only)
```

Reports NEVER modify results. Results change only via recount procedure.

## Stores

6th file store: `data/incidents/incidents.json` (metadata only — station, category,
description, reporter, status, history, evidence refs). No choices, no voter IDs,
no token hashes (enforced by `npm run lint:privacy`).

Status transitions append `INCIDENT_*` events to the hash-chained audit log.

## Commands

```bash
npm run incidents -- report --station X --category ballot-issue --description "..." [--reporter observer:1]
npm run incidents -- triage --id INC-0001 --decision investigating --note "..."
npm run incidents -- resolve --id INC-0001 --note "..."
npm run incidents -- reopen --id INC-0001 --note "..."
npm run incidents -- list [--station X] [--status open]
npm run incidents -- summary
npm run transparency -- observe --station X   # observer view: result + event chain + incident list
npm run simulate -- --anomalies               # inject 99% turnout → auto-opens 1 triaged incident
```

Categories: `voting-equipment, ballot-issue, counting-discrepancy, unauthorized-access,
intimidation, procedural-violation, accessibility-issue, network-failure, power-failure, other`.
