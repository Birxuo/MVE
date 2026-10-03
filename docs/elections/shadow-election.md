# Shadow Election Protocol (research draft)

The system shadows a real election WITHOUT legal effect: two parallel counts,
one comparison.

## Rules

1. The official paper process is untouched and solely authoritative.
2. The verification system ingests ONLY copies: station officers transcribe
   published per-station totals into signed packages (`station close` flow on
   shadow data), or import scanned result sheets as incident evidence.
3. No voter data enters the shadow system; no shadow output is presented as
   an official result anywhere, ever.
4. Comparison runs after certification: official totals vs shadow totals vs
   paper recount sample. Discrepancies become incident cases for study, not
   challenges to the certified result.

## Outputs

- Shadow comparison report (template: `research/audits/pilot-200.md`).
- RLA drill report on shadow data.
- Anomaly-flag review log with human dispositions.
- Lessons-learned feeding the legal-pilot authorization file.

## Stop conditions

Any of: legal authority objects, observers withdraw, discrepancy rate exceeds
the pre-committed RLA tolerance twice, or data-handling incident. Stop means
stop — the shadow never promotes itself.
