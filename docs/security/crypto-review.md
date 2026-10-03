# Cryptographic Review V2 (self-review 2026-10-03, NOT an independent audit)

Scope: `services/results`, `services/election-core/src/crypto-utils.ts`,
`services/election-core/src/shares.ts`, `services/audit` chaining,
`voting/client` booth + firmware gate, receipt scheme.
Status legend: OK = acceptable for research prototype; GAP = must fix before any pilot;
DEFERRED = consciously postponed per FULL_PLAN.md.

## What is used (all standard, no custom crypto)

- Hash: SHA-256 over canonical JSON (sorted keys, recursive). OK.
- Signatures: Ed25519 via `node:crypto` (`generateKeyPairSync`, `sign`, `verify`). OK.
- Randomness: `crypto.randomBytes` (tokens), `crypto.randomUUID` (ballot IDs). OK.
- Transport/at-rest: NOT in scope of this codebase (CLI + local files). GAP for any networked deployment (needs TLS 1.3 / AES-256-GCM).

## Signature semantics (verified by `tests/security.e2e.test.ts`, `tests/fuzz.test.ts`)

- `result_hash = sha256(canonical(package sans hash/sig))`; `signature = Ed25519(result_hash)`.
- `verifyResult` checks hash recomputation AND signature over stored hash.
- Tamper (`201→301`, negative counts, giant keys, corrupt base64) → `hashOk && sigOk` false, never throws. OK.

## Gaps (must not be misrepresented)

1. **Ephemeral device keys → CA-backed (CLOSED for single-key custody).** `manage ceremony`
   generates a witnessed election root (custodians + observer + image hash in
   `ca/ca.json` + `CEREMONY` audit event) as 2-of-3 Shamir shares
   (`services/election-core/src/shares.ts`, `tests/pki.test.ts`: any pair
   reconstructs, one share fails, tampered share mismatches the root);
   `manage ca-sign-device --shares A,B` certifies each station binding and
   refuses unless the reconstructed key equals the published root; `openMachine`
   fails closed on missing/invalid certs whenever a CA is published. Remaining:
   HSM storage and an INDEPENDENT cryptographic review.
2. **Firmware attestation: procedural manifest (PARTIALLY CLOSED).** `openMachine`
   refuses unless the measured hash matches the station binding AND appears in
   the approved-release manifest (`voting/client/src/firmware.ts`, tested in
   `tests/paper.test.ts`); `add-station` warns on unapproved hashes. Remaining:
   measured boot / TPM / signed manifest file and HSM storage — GAP for any
   hardware deployment.
3. **V1 ballot privacy is structural, not cryptographic.** Separation + single-use tokens + privacy lint; votes are NOT homomorphically encrypted and there are no mixnets/ZK proofs (FULL_PLAN §§27–28, correctly DEFERRED).
4. **Audit log signatures: CLOSED.** `AuditLog` supports Ed25519
   per-event signatures (`signEvent`/`verifyEventChain`/`auditCoverage`): the
   polling booth signs all file events with its device key, `manage`
   open/close and incident events are signed by the station device key when the
   booth has opened there (stderr warning otherwise), CA-issued events
   (`CEREMONY`/`DEVICE_CERTIFIED`/`DEVICE_REVOKED` under deviceId `CA`) are
   signed by the election root (quorum-resolved), and `transparency
   audit-verify --strict` fails on any unsigned or unverifiable event
   (`tests/audit-sign.test.ts`). Remaining: `TRANSMISSION_RECEIVED` receipts in
   the national store stay hash-chained only (terminal keys are X25519, no
   signing key yet); independent live replica storage is `fork()` + re-verify
   (no live replication protocol).
5. **Receipts: commitment-bound (PARTIALLY CLOSED).** `ballotCommitment` binds
   (ballotId, blinding) into the stored row; `verifyParticipationReceipt`
   recomputes and requires an exact match (`tests/paper.test.ts`: round-trip,
   wrong-blinding refusal, legacy-code backward compat, blinding never
   persisted). A leaked store no longer turns a voter's code into a ballot
   lookup. Remaining: the booth sees the blinding at issuance, and
   blind-signature issuance (booth never learns the receipt at all) is deferred.

## Verdict (2026-10-03 self-pass)

Fit for research/simulation. Gap 1 (single-key custody) is closed via 2-of-3
shares; gap 2 (attestation) has a procedural manifest but measured boot is still
missing. NOT fit for pilot claims of end-to-end verifiability until gap 2 is
closed (measured boot or documented procedural equivalent accepted by the
certifier) AND an INDEPENDENT cryptographic review (README Phase 6) is
commissioned. No custom crypto anywhere: Ed25519 / SHA-256 / X25519+AES-GCM /
Shamir-over-GF(256) splitting only — the sharing math is textbook, but it has
not had outside review either.
