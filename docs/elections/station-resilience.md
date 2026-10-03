# Station Resilience SOP — Power & Connectivity (research draft)

## Power failure

1. Voting CONTINUES on station UPS/battery. The machine never needs the
   network; every ballot, slip, and audit event lands on local disk first.
2. If the machine itself dies mid-day: do NOT improvise. Record the outage as
   a `power-failure` incident, secure the paper slips and the disk, and resume
   on the backup unit by re-opening with 2 approvals (reopen is audit-logged
   and itself anomaly-flagged for review).
3. On restore: finish voting, close with 3 approvals. `reconcile` will refuse
   to sign if anything went missing — that refusal is the procedure working.
4. Drill (coded): `npm run chaos -- --only power` — halt leaves no package,
   resume counts everything.

Kit per station: UPS + spare battery, printed officer checklist in ar/zgh/fr,
sealed paper-slip satchel, backup removable media for the transmission bundle.

## Connectivity loss

There is nothing to lose: stations are offline by design.
Results leave only as sealed `.mvepkg` bundles on physical media
(`transmission export`), verified and merged at the terminal (`transmission import`).
Media handling policy (single-use media, custody log, intake quarantine,
duplicate/stale refusal): `docs/security/removable-media.md`.
A station that never transmits appears as open-but-unpublished in `observe` —
an explicit, investigable state, never a silent gap.

## Disaster recovery — 3 copies, any one rebuilds (C4)

Keep three independent copies: the station's signed
`stations/<id>/result.json`, the regional data-center mirror (`stations/` +
`audit/` copied off-site), and offline archival media. The national aggregate
(`transparency/results.json`) is DERIVED data — it can always be rebuilt:

```bash
npm run recover -- --data national                              # rebuild from local station copies
npm run recover -- --data national --from /mnt/regional-copy   # rebuild from a surviving off-site copy
npm run recover -- --data national --from /mnt/archival-media   # rebuild from offline media
```

Rules: every copy is hash-verified before joining the rebuild; any missing or
invalid station aborts with a named gap (exit 1, aggregate untouched); an
empty source (no `POLL_CLOSED`) exits 2 instead of writing an empty aggregate;
each rebuild appends a `RECOVERY_COMPLETED` receipt (stations, source) to the
target audit log. Drill matrix (coded in `tests/recover.test.ts`): aggregate
deleted → identical hashes restored; station copy missing → `MISSING: S2`,
refused; national wiped → `--from` backup restores identical hashes.
