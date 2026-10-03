# Crypto Protocol V1 (auditable, no custom crypto)

Source: `README.md` Cryptographic Verification + Security Requirements.

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
- Ballot DB stores `{ballotId, tokenHash: sha256(token), commitment, stationId, ts, choiceId (V1 plaintext in simulator only)}`. V1 simulator uses plaintext `choiceId` + notes that production needs mixnet/homomorphic encryption (deferred).
- Participation receipt (commitment-bound): at cast the booth generates a random
  16-byte `blinding`, stores `commitment = sha256(ballotId:blinding)` on the row
  (+ `BALLOT_CAST` audit payload), and hands the voter `(ballotId, code, blinding)`
  where `code` is the first 8 hex of the commitment as `XXXX-XXXX`. The blinding
  is NEVER persisted. Verification recomputes the commitment and requires an
  exact row match — so the booth cannot hand out valid codes for dropped ballots,
  and a leaked store does not turn a code into a ballot lookup (codes are not
  recomputable from ballotId alone). Legacy pre-commitment rows verify via the
  old deterministic `sha256("receipt:"+ballotId)` code. Residuals: the booth
  sees the blinding at issuance (take-home slip channel, not screen, in
  production); blind-signature issuance is deferred.

## Audit log chaining

`event = {seq, ts, type, stationId, deviceId, payload, prevHash, hash, sig}` where `hash = sha256(prevHash|canonical(payload))`.

Defer: ZK proofs, homomorphic tally (research only in V1).
