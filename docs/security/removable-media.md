# Removable-Media Handling (research procedure — offline-first transport)

Bundles (`.mvepkg`) move between polling stations and the national terminal
ONLY on physical media. No network code exists anywhere in the prototype, so
this procedure IS the transport security.

## Rules

1. **Single-use media.** One write-once SD card / USB stick per station export,
   labeled `MVE-<station>-<date>-<seq>` (e.g. `MVE-TANGER-0001-2026-09-23-01`).
   Never reuse media across stations or elections.
2. **Sealed before carry.** Export with `transmission export` on the station
   machine; verify the file hashes by reading back `sha256sum X.mvepkg` and
   logging it in the station minutes. The terminal refuses anything but
   authenticated v1 bundles.
3. **Chain of custody.** Log every hand-off: who carried, departure/arrival
   times, seal number. Two people present at terminal intake.
4. **Terminal intake quarantine.** Copy the bundle to a quarantine dir, log its
   `sha256`, then `transmission import`. The terminal keeps an import journal
   (`transmission/imports.json`): exact duplicates and stale (older-or-equal
   timestamp) bundles are REFUSED; only a strictly newer supervised re-close
   supersedes, and the receipt records what it superseded. Re-import the same
   file to prove the journal rejects it.
5. **No executables, no autorun.** Media carries exactly one `.mvepkg` JSON file.
   Terminal machines disable automount-execute; never open unexpected files.
6. **Retain, then destroy.** Keep media sealed until the audit window closes
   (RLA + disputes), then wipe (NIST 800-88 purge) and log destruction.

## Residuals (not solved here)

- Station clocks are asserted: a compromised clock can claim newness. Pair
  re-close acceptance with supervised procedure + `revoke-device` on suspicion.
- This is procedural, not device-enforced (no USB-port lockdown in the
  simulator). Production hardware disables ports per the hardened-device requirements.
