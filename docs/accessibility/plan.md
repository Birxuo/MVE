# Accessibility Plan (research draft)

A national system must serve Arabic, Amazigh, and French speakers, including
voters with disabilities and low digital literacy. Current prototype status:
all operator prompts are English-only CLI strings — this is a known gap.

## Current user-facing strings (i18n inventory, all English)

- `station open/vote/close/status` flows (`voting/client/src/cli.ts`):
  `opened`, `ballot … deposited. Participation receipt …`, `SPOILED …`,
  `CLOSE REFUSED …`, station status tables.
- `manage` CLI (`services/election-core/src/cli.ts`): `seeded …`, `registered …`,
  `opened/closed …`, `missing --<flag>` errors.
- `transparency` / `incidents` CLIs: `VALID/INVALID`, `reported …`, status words
  (`open/triaged/investigating/resolved/dismissed`), `MISMATCH/MATCH`.

## Roadmap

- [x] Externalize station-CLI strings (`services/election-core/src/i18n.ts`:
      `en`/`ar`/`fr`/`zgh`, `--lang` flag + `MVE_LANG` env; `tests/i18n.test.ts`
      enforces key parity). zgh bundle is provisional — native review required.
- [ ] Extend bundles to `manage`/`transparency`/`incidents` operator strings.
- [ ] Voter-facing print: slip + receipt text in the voter's language; receipt
      must stay choice-free in every language (privacy lint extends to bundles).
- [ ] Non-visual access: audio confirmation of slip contents before deposit;
      screen-reader-safe result tables; high-contrast/large-text portal theme.
- [ ] Assisted voting: companion procedure where the voter dictates and two
      officers of different affiliations confirm — logged as an assisted session
      with the same reconcile-or-refuse guarantees (`machine.ts` close path).
- [ ] Literacy: numbered-step pictorial guides at each station; `--help` text
      rewritten to a 6th-grade reading level per locale.
- [ ] Accessibility audit before any pilot (README Phase 6).
