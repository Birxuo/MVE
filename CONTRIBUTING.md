# Contributing — MVE

Research / prototype project. License: personal & non-commercial (see `LICENSE`).

Welcome: research, threat modeling, security analysis, crypto research, accessibility, docs, simulations, tests.

## Rules

1. Do not touch real election systems or real voter data.
2. Preserve voter privacy: never create `identity → vote` mappings.
3. Security-critical code needs >1 reviewer; must include adversarial tests.
4. Use standard crypto only (Ed25519, SHA-256/SHA-3, AES-256, TLS 1.3).
5. Keep polling-station operation offline-first.

See `README.md#development-rules` and `FULL_PLAN.md`.
