# Legal Framework Checklist (research draft, NOT legal advice)

Technology is ~50% of this project (FULL_PLAN §38). None of the following exists
yet; each would need legislation/authorization before any real deployment:

- [ ] Digital ballot validity (electronic record as electoral evidence)
- [ ] Electronic signatures on result packages (evidentiary status)
- [ ] Digital election records (retention, admissibility)
- [ ] Mandatory audit requirements (RLA methodology set pre-election)
- [ ] Cybersecurity standards for devices and infrastructure
- [ ] Observer access rights (data scope, station access)
- [ ] Public result publication (what, when, in which format)
- [ ] Recount procedures and triggers
- [ ] Machine + software certification regime
- [ ] Incident response authority and evidence preservation
- [ ] Criminal penalties (tampering, coercion, vote-buying)
- [ ] Data protection authorization (see `docs/privacy/law-09-08-review.md`)
- [ ] Accessibility obligations (see `docs/accessibility/plan.md`)

⸻

## Draft skeleton provisions (illustrative only — drafting by qualified counsel required)

**Art. 1 — Hybrid record.** The legally authoritative election record consists of
the voter-verified paper ballots together with the cryptographically signed
electronic packages; neither alone suffices. In case of divergence beyond the
pre-committed tolerance, the risk-limiting audit procedure decides, up to a full
hand recount.

**Art. 2 — Signatures.** Station result packages bear the device signature and,
where officer keys are registered, at least one officer endorsement over the
tally digest. Verification software and test vectors are public.

**Art. 3 — Audit.** The RLA sample table, randomness-ceremony rules, and
escalation thresholds publish before election day and cannot change after polls
open. Audit datasets publish within 30 days, free of personal data.

**Art. 4 — Certification.** Voting devices and software versions operate only
with a joint certificate (election authority + independent cybersecurity
authority) following witnessed key ceremonies; firmware hashes publish per device.

**Art. 5 — Observation.** Accredited observers access station events, results,
and incident metadata in real time; voter identities and individual choices are
never observable.

**Art. 6 — Offences.** Tampering with ballots, packages, logs, or devices;
coercing voters; buying votes (including via fabricated "proofs of vote");
and operating uncertified equipment carry [penalties to be set].

**Art. 7 — Shadow operations.** Verification systems may run alongside official
processes with no legal effect, under the shadow protocol
(`docs/elections/shadow-election.md`), until a separate legal-pilot act passes.
