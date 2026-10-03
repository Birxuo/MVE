// Approved firmware manifest — procedural V1 (device identity requirements).
// The booth refuses to open unless the MEASURED firmware hash is BOTH bound to
// the station device (device.ts verifyFirmware) AND present in this table.
// Production replaces this static table with a signed manifest file verified
// against measured boot (TPM); per-device kill-switch is `revoke-device`.
export interface FirmwareRelease { version: string; note: string; }

export const APPROVED_FIRMWARE: ReadonlyMap<string, FirmwareRelease> = new Map([
  ['sha256:sim-firmware-v1', { version: 'sim-v1', note: 'research simulator + prototype booth build' }],
]);

export function isApprovedFirmware(hash: string): boolean {
  return APPROVED_FIRMWARE.has(hash);
}

export function firmwareVersion(hash: string): string | undefined {
  return APPROVED_FIRMWARE.get(hash)?.version;
}

export function approvedFirmwareList(): { hash: string; version: string; note: string }[] {
  return [...APPROVED_FIRMWARE.entries()].map(([hash, r]) => ({ hash, ...r }));
}

/** Fail-closed gate: throw unless the measured hash is an approved release. */
export function checkApprovedFirmware(actual: string, stationId: string): void {
  if (!isApprovedFirmware(actual)) {
    throw new Error(
      `${stationId}: unknown firmware ${actual} — not in the approved release manifest. Refusing to open.`,
    );
  }
}
