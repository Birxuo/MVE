# Cryptographic Review V1 (self-review, NOT an independent audit)

Scope: `services/results`, `services/election-core/src/crypto-utils.ts`, `services/audit` chaining.
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

1. **Ephemeral device keys.** `generateDeviceKeys` creates keys in-memory per run; no certificate chain, no HSM/TPM, no key ceremony (FULL_PLAN §5). GAP — `verify --pubkey` only works when the operator persists the key out-of-band.
2. **No firmware attestation.** `firmware_hash` is a asserted string, not measured boot. GAP — procedural only.
3. **V1 ballot privacy is structural, not cryptographic.** Separation + single-use tokens + privacy lint; votes are NOT homomorphically encrypted and there are no mixnets/ZK proofs (FULL_PLAN §§27–28, correctly DEFERRED).
4. **Audit log signatures: PARTIALLY CLOSED.** `AuditLog` supports Ed25519
   per-event signatures (`signEvent`/`verifyEventChain`), the polling booth
   signs all file events with its device key, and `transparency audit-verify`
   checks hashes + signatures against station pubkeys. Remaining: management and
   incident CLIs have no device keys and stay hash-chained only; independent
   replica storage is `fork()` + re-verify (no live replication protocol).
5. **Receipts are demonstrative.** `participationReceipt` proves inclusion only if the ballot store is honest; no blind-signature / commitment scheme yet. GAP for anti-coercion claims beyond "no proof of choice exists".

## Verdict

Fit for research/simulation. NOT fit for pilot claims of end-to-end verifiability until gaps 1–2 (key ceremony, measured boot or documented procedural equivalent) are closed, and an INDEPENDENT cryptographic review (README Phase 6) is commissioned.
