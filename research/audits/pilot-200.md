# Tangier Pilot Comparison — 200 stations (research simulation, NOT a real election)

Run: `simulate --stations 200 --voters 50 --seed 20260923 --paper` (90% turnout model).
Date: 2026-09-26. Seed makes the run reproducible.

## Three evidence streams

| stream | source | count |
|---|---|---|
| Electronic ballots | `voting/ballots.json` (anonymous, token-hashed) | 8,990 |
| Paper slips | `paper/<station>/<ballot>.json` (choice only, no voter IDs) | 8,990 files across 200 stations |
| Published results | `transparency/results.json` (Ed25519-signed packages) | 200 packages, 8,990 counted |
| Audit events | `audit/events.json` (hash-chained) | 782, chain verifies |

Totals by choice — electronic 3,068 / 2,931 / 2,991 vs paper identical (see check output).

## Comparisons

1. **Electronic vs paper** (`verify-paper`, all 200 stations): 200/200 MATCH —
   counts equal and per-choice tallies equal at every station.
2. **Electronic vs published**: published `ballots_counted` equals electronic count
   at all 200 stations; all `result_hash` values recompute cleanly.
3. **Manual (RLA slip-level)**: `verify-paper --sample 40 --seed 20260923` —
   40/40 sampled stations, zero `paper-only` / `electronic-only` slip IDs.

## Method notes

- Paper slips here are JSON analogues of the voter-verified printout; the
  comparison logic (`voting/verification/src/check.ts`) is what a manual
  hand-count team would execute against the same three piles.
- `data/` for this run lived in scratch space; only this summary is committed.
- Next scale step (10,000 stations) needs streaming writes per `docs/security/baseline.md`.
