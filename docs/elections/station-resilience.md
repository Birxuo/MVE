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

There is nothing to lose: stations are offline by design (FULL_PLAN §7).
Results leave only as sealed `.mvepkg` bundles on physical media
(`transmission export`), verified and merged at the terminal (`transmission import`).
A station that never transmits appears as open-but-unpublished in `observe` —
an explicit, investigable state, never a silent gap.
