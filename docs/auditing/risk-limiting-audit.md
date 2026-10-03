# Risk-Limiting Audit (RLA) — hardened procedure

1. **Before election day**, the sample table below is published and frozen.
   Auditors look the row up; sample size is never negotiated after results.
2. **Randomness ceremony** (public, witnessed): observers roll dice / draw lots,
   producing a hex string published immediately (e.g. `9f3a…`) via
   `manage rla-ceremony --hex <HEX> --by <witness>`. The record
   (`audit/rla-ceremony.json`) is immutable — a second publication with a
   different hex is refused. The sample seed is
   `seedFromCeremony(hex)` = first 32 bits of `sha256("rla-ceremony:"+hex)`.
   Anyone with the published hex reproduces the exact sample.
3. After close, take the 100% electronic tally per station.
4. Draw the sample: `verify-paper --sample auto` uses the table row and the
   recorded ceremony automatically; `--ceremony HEX` overrides for independent
   reproduction from the published hex alone; `--seed` without any ceremony is
   flagged `NOT ceremony-bound — demo only` and must never support a real audit.
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
Until then, passing the research table proves the *machinery* (sampling,
binding, adjudication, escalation) — never a statistical risk limit.

## Commands

```bash
npm run manage -- rla-ceremony --hex 9f3a7c1d44aa90be12 --by observer:7  # publish pre-election, immutable
npm run verify-paper -- --sample auto                                     # table size + recorded ceremony
npm run verify-paper -- --sample 20 --ceremony 9f3a7c1d44aa90be12        # independent repro from hex alone
npm run verify-paper -- --sample 20 --seed 7                              # demo only: flagged NOT ceremony-bound
```
