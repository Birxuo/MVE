# Key Ceremony (research procedure — adapt with cryptographers before any pilot)

GAP 1–2 in `docs/security/crypto-review.md`: device keys are currently
ephemeral. A real deployment needs a witnessed ceremony so no single person
ever holds signing power alone.

## Roles (3 custodians, quorum 2)

- **Custodian A** — election authority (brings the offline ceremony machine).
- **Custodian B** — independent cybersecurity authority (verifies software hashes).
- **Observer C** — accredited observer (witnesses, co-signs the minutes).

## Ceremony steps

Implemented subset (`manage ceremony|ca-sign-device|revoke-device`,
`voting/client/src/device.ts`, enforced in `openMachine`):

1. **Prepare.** Air-gapped machine, booted from published installer image.
   B verifies `sha256` of the image against the published value; C records it.
2. **Election root.** Generate the offline election root Ed25519 keypair.
   Private key splits into 2-of-3 paper shares (one per custodian); the machine
   is wiped after export. Public key publishes to the transparency ledger.
3. **Device keys.** Per polling-station device: generate Ed25519 pair, record
   `device.json` binding (device ↔ station ↔ firmware hash), seal the private
   key to removable media labeled per station. Two custodians co-sign the
   device registry; C countersigns.
4. **Officer keys.** Each authorized officer generates a personal Ed25519 pair
   on their own hardware; only the PUBLIC key registers (`manage officer-keygen`
   prints the private key once — in production the private key never touches
   election infrastructure). Close requires ≥1 officer endorsement signature
   over the tally digest (`endorsementDigest`: counts + metadata, no timestamp,
   so endorsements survive re-signing) whenever officer keys are registered, so
   the published result is bound by two independent keys (device + human).
5. **Terminal keys.** X25519 terminal pair per receiving terminal
   (`transmission terminal-init`); public keys carried to stations on paper.
6. **Minutes.** Every step logged with hashes; minutes publish to the ledger.
   Any deviation (wrong hash, missing witness) aborts the ceremony.

## Revocation

- Compromised device: publish revocation into the ledger; `verify` tooling
  treats packages from revoked devices as INVALID (implementation pending —
  recorded as follow-up, not yet coded).
- Lost officer share: re-run steps 2–4 for the affected scope; old keys revoke.

## Threshold signatures (deferred, rationale)

True k-of-n threshold Ed25519 (FROST) would remove single-key moments entirely,
but adds distributed-keygen complexity this prototype cannot review properly.
Officer endorsement (device key + human key over the same hash) is the
auditable middle ground: two keys, two holders, one hash.
