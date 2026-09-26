# Public Portal (placeholder)

Future HTTP UI for `GET /api/elections,/districts,/polling-stations,/results,/audits,/incidents,/verification`
(see `docs/architecture/api-spec.yaml`).

V1 ships the read-only transparency CLI instead:

```bash
npm run transparency -- results
npm run transparency -- verify
npm run transparency -- export-csv --out results.csv
```

No voter PII is ever exposed here — only station totals, hashes, signatures, audit status.
