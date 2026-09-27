# Risk-Limiting Audit (RLA) — hardened procedure

1. **Before election day**, the sample table below is published and frozen.
   Auditors look the row up; sample size is never negotiated after results.
2. **Randomness ceremony** (public, witnessed): observers roll dice / draw lots,
   producing a hex string published immediately (e.g. `9f3a…`). The sample seed is
   `seedFromCeremony(hex)` = first 32 bits of `sha256("rla-ceremony:"+hex)`.
   Anyone with the published hex reproduces the exact sample (`--ceremony`).
3. After close, take the 100% electronic tally per station.
4. Draw the sample (`sampleStations`), hand-count paper vs electronic per station.
5. **Adjudicate** (`adjudicateSample`, human decision, never AI):
   - 0 mismatches → `PASS`
   - within tolerance → `ESCALATE` (expand sample ×3, recount)
   - beyond tolerance → `FULL_RECOUNT`
6. Publish `audit-results.csv` with `station, sampled, matched, status: PASSED|ESCALATED`.

## Pre-committed sample table (research-grade, not a calibrated risk limit)

| stations covered | initial sample | mismatches allowed |
|---|---|---|
| ≤ 10 | 2 | 0 |
| ≤ 50 | 5 | 0 |
| ≤ 200 | 20 | 1 |
| ≤ 1000 | 50 | 1 |
| > 1000 | 100 | 2 |

A production deployment must replace this table with a statistically calibrated
RLA (e.g. BRAVO/median-based) designed with election-audit experts.

## Commands

```bash
npm run verify-paper -- --sample 20                       # default test seed
npm run verify-paper -- --sample 20 --ceremony 9f3a…      # public ceremony seed
```
