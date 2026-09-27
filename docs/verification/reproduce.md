# Independent Reproduction (FULL_PLAN §29 — don't trust, verify)

You don't need this repository's code to check an election. You need the five
open-data CSVs, Node.js (for SHA-256/Ed25519), and the 160-line
`apps/verification/verify-bundle.js` — read it in full; that is the audit.

## 3 commands

```bash
# 1. Publish the dataset (election side)
npm run transparency -- export-all --dir open-data

# 2. Verify hashes + totals from the CSVs alone (researcher side)
node apps/verification/verify-bundle.js --dir open-data

# 3. ...plus signatures, given the station public keys
node apps/verification/verify-bundle.js --dir open-data --pubkeys station-keys/
```

## What step 2 proves

- Every `result_hash` recomputes from its own row (canonical JSON, sorted keys —
  reimplemented inside the bundle, not imported).
- Every row's `counted` equals the sum of its per-choice counts (zero-count
  choices are omitted from tallies by rule; the bundle mirrors it).
- National totals printed from CSV sums alone.

Exit `0` = all valid, `3` = any INVALID row, `2` = malformed dataset.

## Limits (honest)

- Hash validity proves the package is intact, not that the votes are real —
  that is what paper audit (`verify-paper`) and observers are for.
- Signature checks need authentic station pubkeys; key distribution is a
  procedural ceremony outside this codebase (see `docs/security/crypto-review.md`).
