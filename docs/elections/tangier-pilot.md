# Tangier Controlled Pilot Plan (research draft — no authorization implied)

> STATUS: SIMULATION ONLY. No controlled pilot is authorized, staffed, or
> scheduled. Every gate below is UNMET. A pilot runs the technology ALONGSIDE
> the existing paper process and never determines the legal result until
> separately authorized (FULL_PLAN §§22–23, 48; shadow rules in
> `docs/elections/shadow-election.md` — the shadow never promotes itself).

## Station typology (start 10 → 50 → 200)

- Dense urban (Casabarata, Beni Makada): throughput + queue UX.
- Suburban + rural surroundings: power/connectivity resilience, transport of bundles.
- High-turnout and low-turnout stations: RLA sample behavior at both ends.

## Comparison protocol (coded)

1. `simulate --stations N --paper` produces all three evidence streams.
2. `verify-paper` compares electronic vs paper vs published per station.
3. `verify-paper --sample K --ceremony HEX` executes the public-seed RLA drill.
4. `research/audits/pilot-200.md` is the template for the pilot report;
   each scale step (10/50/200) gets its own dated report in `research/audits/`.

## Gate 0 — Simulation (current stage, partial)

- [x] 200-station simulation report (`research/audits/pilot-200.md`)
- [x] 10,000-station scale evidence (`docs/security/baseline.md`)
- [ ] Dated 10-station simulation report in `research/audits/`
- [ ] Dated 50-station simulation report in `research/audits/`
- [x] Adversarial barrier matrix green (`research/simulations/barriers.ts`, 6/6)

## Gate 1 — Controlled pilot, 10 stations (ALL UNMET)

- [ ] Independent security review commissioned (owner: independent cybersecurity authority)
- [ ] Witnessed key ceremony executed and minuted (custodians + observer)
- [ ] Observer accreditation open (regulation + registry)
- [ ] Accessibility checklist signed (owner: election authority)
- [ ] DR drill (`recover`, incl. `--from` off-site copy) demonstrated to observers
- [ ] RLA table + ceremony rules published pre-election (frozen, immutable record)
- [ ] Legal-pilot act in force for the 10 stations (owner: legislature)
- [ ] Shadow protocol acknowledged by all parties (`shadow-election.md` rules 1–4)

## Gate 2 — Expand to 50 stations (requires Gate 1 + ALL of)

- [ ] Gate 1 report: 10/10 stations MATCH, zero unexplained discrepancies
- [ ] RLA adjudication on Gate 1 sample: PASS (or ESCALATE fully resolved)
- [ ] Incident case files all triaged with human dispositions
- [ ] Observer sign-off to expand (accredited majority, minuted)
- [ ] Legal-pilot act extended to the 50 stations

## Gate 3 — Expand to 200 stations (requires Gate 2 + ALL of)

- [ ] Gate 2 report: MATCH across all 50, recount exercises completed
- [ ] Full RLA cycle demonstrated (sample → hand count → adjudicate → publish)
- [ ] Transmission journal reviewed: zero unexplained duplicates/stale refusals
- [ ] Independent review panel accepts the evidence file
- [ ] Legal-pilot act extended to the 200 stations

## Promotion rule

No gate promotes on a failed predecessor. Any legal-authority objection,
observer withdrawal, or discrepancy rate above the pre-committed RLA tolerance
twice STOPS the pilot (shadow stop conditions apply throughout).
