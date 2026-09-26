# Crypto Protocol V1 (auditable, no custom crypto)

Source: `FULL_PLAN.md` §§ 5-9, 27-28.

## Primitives

- Hash: SHA-256 (hex, lowercase). Later: SHA-3 option.
- Signatures: Ed25519. Keys: per-device `deviceId → {publicKey, cert}`; election root offline.
- Transport: TLS 1.3 when online. At rest: AES-256-GCM (V1: Node `crypto`; HSM/TPM in later phases).

## Result package (canonical JSON, sorted keys)

```json
{
  "election": "ELECTION-ID",
  "polling_station": "STATION-ID",
  "device": "DEVICE-ID",
  "ballots_issued": 487,
  "ballots_counted": 487,
  "invalid_ballots": 0,
  "results": {"candidate_a": 201, "candidate_b": 176},
  "timestamp": "2026-09-23T19:05:00Z",
  "firmware_hash": "sha256:...",
  "result_hash": "sha256:...",
  "signature": "ed25519:..."
}
```

`result_hash = sha256(canonical_json_without_hash_and_signature)`.
`signature = ed25519_sign(result_hash, devicePrivkey)`.
Verify = recompute hash + `ed25519_verify`.

## Ballot privacy

- Eligibility service issues random `token (16 bytes hex)` + marks `voter.status=VOTED`. Token is single-use, no voter link stored in ballot DB.
- Ballot DB stores `{ballotId, tokenHash: sha256(token), encryptedVote?, choiceId (V1 plaintext in simulator only), stationId, ts}`. V1 simulator uses plaintext `choiceId` + notes that production needs mixnet/homomorphic encryption (deferred).
- Participation receipt = `sha256(ballotId)` truncated, NOT proof of choice.

## Audit log chaining

`event = {seq, ts, type, stationId, deviceId, payload, prevHash, hash, sig}` where `hash = sha256(prevHash|canonical(payload))`.

Defer: ZK proofs, homomorphic tally (research only in V1).
