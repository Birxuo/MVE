# Risk-Limiting Audit (RLA) — V1 simulator

1. After close, take 100% electronic tally per station.
2. Random sample of stations/ballots (seeded RNG for reproducibility; prod uses public randomness ceremony).
3. Manually compare paper vs electronic for sample.
4. If mismatch > tolerance → expand sample → full recount procedure (human decision, never AI).
5. Publish `audit-results.csv` with `station, sampled, matched, status: PASSED|ESCALATED`.

Sample-size table pre-committed before election (prevents selective auditing).
V1 implements `services/audit` sampler + `research/simulations` driver.
