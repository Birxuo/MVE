# Management API (CLI + file stores) — V1

Zero-dependency. File stores under `data/` (gitignored), 5 separated JSON files:

- `data/identity/voters.json` — voters only, no choices
- `data/election/election.json` — elections, districts, stations, candidates, officers
- `data/voting/ballots.json` — ballots only, no voter IDs
- `data/audit/events.json` — hash-chained events
- `data/transparency/results.json` — signed result packages (public)

## Manage (election-core CLI)

```bash
npm run manage -- seed-demo --stations 3 --voters 10
npm run manage -- status
npm run manage -- open-station --station TANGER-ASilah-0001 --approvals presiding,observer   # needs >=2
npm run manage -- close-station --station TANGER-ASilah-0001 --approvals presiding,deputy,observer  # needs >=3
npm run manage -- register-voters --station TANGER-ASilah-0001 --count 25
```

Supports both `--key value` and `--key=value`. Custom root: `--data /tmp/mve-data`.

Full command list: `init-election`, `add-district`, `add-station`, `add-candidate`,
`register-voters`, `open-station`, `close-station`, `seed-demo`, `status`.

## Simulate (writes file stores)

```bash
npm run simulate -- --stations 3 --voters 10 --seed 7 --out /tmp/mve-results.csv --data data
```

Persists results + ballots + audit events to `data/` for the transparency CLI.

## Transparency (read-only)

```bash
npm run transparency -- results [--station X] [--data data]
npm run transparency -- verify [--station X] [--pubkey device.pem]   # hash always; sig when key given
npm run transparency -- export-csv [--out results.csv]
npm run transparency -- audit-status
```

Exit codes: `0` valid, `1` no data, `3` tamper detected.
