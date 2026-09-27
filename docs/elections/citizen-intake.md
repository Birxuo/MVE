# Citizen Intake Channels (research spec — only web + CLI implemented)

FULL_PLAN §17 requires reporting via web, mobile, SMS, hotline, and polling-station
QR. Status per channel:

## Implemented

- **Web form** — observer portal `/` report form (works for citizens; reporter
  may be `anonymous`). Evidence upload with sha256 check
  (`apps/observer-portal/src/server.ts`).
- **CLI** — `npm run incidents -- report …` (officers, accessibility fallback).
- **Citizen page** — `apps/public-portal/citizen.html` links reporting and
  frames expectations (review workflow, never auto-changes results).

## Specified, not built

- **SMS gateway.** Inbound number → structured report (station code + category
  keyword + free text); gateway signs receipt; media attachments unsupported —
  SMS reports carry no evidence, flagged lower-priority. Requires telecom
  contract, abuse/rate limits, and CNDP review of stored phone numbers.
- **Hotline.** Human operators file via the same `POST /api/reports` endpoint
  (operator ID as reporter); calls logged, recordings under retention policy.
- **Polling-station QR.** Per-station QR encodes the report URL + station ID;
  scanning pre-fills the web form. QR plates printed from `data/election`
  during station setup (`manage` extension — not yet coded).
- **Mobile app.** Explicitly deferred: a dedicated app adds device-security and
  coercion surface for no intake benefit over the mobile web form.

## Anti-abuse rules (all channels)

Reports never modify results; duplicates are deduped against open cases
(`incidentsFromFlags` pattern); anonymous reports accepted but deprioritized;
reporter identities stay in the incident store, never published
(`GET /api/incidents` strips them — tested in `tests/portal.test.ts`).
