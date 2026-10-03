# Simulations

## Happy path

```bash
npm run simulate -- --stations 10 --voters 50 --seed 42 --data data --out /tmp/results.csv
```

Persists aggregate (`data/transparency/results.json`), audit chain, ballots, incidents,
plus station-local copies (`data/stations/<id>/result.json` + `device.pub.pem`).

## Failure injection (T2.1)

```bash
npm run failures                        # all 5 scenarios, exit 1 on any MISS
npm run failures -- --only tamper       # single scenario
```

| scenario | injection | expected detection |
|---|---|---|
| drop | paper = electronic − 3 | `reconcile` EXCEPTION |
| tamper | +100 votes on published result | `verify` FAIL |
| outage | offline run, late sync | package + chain still verify (resilience) |
| corrupt-device | wrong firmware hash | open refused |
| duplicate | every token replayed | all blocked, count stable |

## Chaos drills (T8): power, partition, DB corruption

```bash
npm run chaos                        # all 3 scenarios, exit 1 on any MISS
npm run chaos -- --only power        # single scenario
```

| scenario | injection | expected detection |
|---|---|---|
| power | halt mid-day (no close), then resume | no package at halt; resume counts all |
| partition | same bundle to two terminals + replay | identical hashes, replay refused |
| db-corruption | bit-flipped ballot store | paper/electronic gap flagged; station copy intact |

## DR drill (T2.2)

```bash
npm run simulate -- --stations 3 --voters 10 --seed 7          # populate data/
npm run recover                # expect RECOVERED, exit 0
rm data/transparency/results.json && npm run recover           # rebuilds aggregate, exit 0
rm -rf data/stations/TANGER-ASilah-0002 && npm run recover     # gap detected, exit 1
```

Expected stations come from `POLL_CLOSED` audit events; each station copy is
hash-verified before joining the rebuilt aggregate.
