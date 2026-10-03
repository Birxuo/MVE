# Citizen Intake Channels (research spec — only web + CLI implemented)

The design requires reporting via web, mobile, SMS, hotline, and polling-station
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

## Lookup abuse rules (B4)

`GET /api/lookup` answers registered-or-not, so it is an enumeration oracle
by nature (same as today's electoral-list portal). Containment, not removal:

- Response is district/station/eligibility ONLY — no choices, tokens, voters,
  no CIN anywhere in the path (registration-card reference, format-gated
  `^[A-Za-z0-9._-]{1,64}$`; malformed input is 400, never a store touch).
- Per-IP sliding-window throttle (30/min, 429 + Retry-After) on `/api/lookup`
  only; published results stay freely browsable.
- Citizen page instructs: registration-card reference, never the CIN; client
  pre-validates format and explains 429.
- Residual: 30/min/IP still permits slow harvesting — production needs
  CAPTCHA/proof-of-work, access logging, and CNDP-reviewed identification.
