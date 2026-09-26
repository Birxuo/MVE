// Device identity — station-bound cryptographic identity (procedural V1).
// Each station keeps data/stations/<id>/device.json + device.pub.pem.
// Private key lives in device.priv.pem, labeled SIMULATION ONLY (see crypto-review GAP 1).
// Real hardware would use measured boot + HSM; here `firmwareHash` is asserted at seed
// time and ENFORCED at open (refuse on mismatch).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

export interface DeviceRecord {
  deviceId: string; stationId: string; firmwareHash: string;
  publicKeyPem: string; boundAt: string;
}

export function stationDir(root: string, stationId: string): string {
  return join(root, 'stations', stationId);
}

/** Load or provision (first open) the station device record. */
export function ensureDevice(
  root: string, stationId: string, deviceId: string, firmwareHash: string,
): { record: DeviceRecord; privateKeyPem: string; created: boolean } {
  const dir = stationDir(root, stationId);
  mkdirSync(dir, { recursive: true });
  const recPath = join(dir, 'device.json');
  const privPath = join(dir, 'device.priv.pem');
  if (existsSync(recPath) && existsSync(privPath)) {
    const record = JSON.parse(readFileSync(recPath, 'utf8')) as DeviceRecord;
    if (record.stationId !== stationId || record.deviceId !== deviceId) {
      throw new Error(`${stationId}: device binding mismatch (bound to ${record.deviceId})`);
    }
    return { record, privateKeyPem: readFileSync(privPath, 'utf8'), created: false };
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const record: DeviceRecord = { deviceId, stationId, firmwareHash, publicKeyPem, boundAt: new Date().toISOString() };
  writeFileSync(recPath, JSON.stringify(record, null, 2) + '\n');
  writeFileSync(privPath, privateKeyPem);
  writeFileSync(join(dir, 'device.pub.pem'), publicKeyPem);
  return { record, privateKeyPem, created: true };
}

/** Firmware gate: refuse to open on any mismatch (FULL_PLAN §5, procedural V1). */
export function verifyFirmware(record: DeviceRecord, actual: string, stationId: string): void {
  if (record.firmwareHash !== actual) {
    throw new Error(
      `${stationId}: firmware mismatch — expected ${record.firmwareHash}, got ${actual}. Refusing to open.`,
    );
  }
}
