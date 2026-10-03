// Device identity — station-bound cryptographic identity (procedural V1).
// Each station keeps data/stations/<id>/device.json + device.pub.pem.
// Private key lives in device.priv.pem, labeled SIMULATION ONLY (see crypto-review GAP 1).
// Real hardware would use measured boot + HSM; here `firmwareHash` is asserted at seed
// time, ENFORCED at open against the device binding (verifyFirmware) AND the
// approved-release manifest (firmware.ts checkApprovedFirmware).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonical, sha256Hex } from '../../../services/election-core/src/crypto-utils.js';

export interface DeviceRecord {
  deviceId: string; stationId: string; firmwareHash: string;
  publicKeyPem: string; boundAt: string;
  /** CA certificate: root signature over the binding (absent = uncertified legacy path). */
  cert?: string;
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

/** Firmware gate: refuse to open on any mismatch (device identity, procedural V1). */
export function verifyFirmware(record: DeviceRecord, actual: string, stationId: string): void {
  if (record.firmwareHash !== actual) {
    throw new Error(
      `${stationId}: firmware mismatch — expected ${record.firmwareHash}, got ${actual}. Refusing to open.`,
    );
  }
}

/** Canonical bytes the CA certifies for a device binding. */
export function certBody(record: Pick<DeviceRecord, 'deviceId' | 'stationId' | 'firmwareHash' | 'publicKeyPem'>): string {
  return canonical({
    deviceId: record.deviceId, stationId: record.stationId,
    firmwareHash: record.firmwareHash, publicKeyPem: record.publicKeyPem,
  });
}

/** Issue a CA certificate for a device binding (ceremony step 3). */
export function signDeviceBinding(
  record: Pick<DeviceRecord, 'deviceId' | 'stationId' | 'firmwareHash' | 'publicKeyPem'>,
  caPrivateKeyPem: string,
): string {
  return sign(null, Buffer.from(sha256Hex(certBody(record)), 'hex'), createPrivateKey(caPrivateKeyPem)).toString('hex');
}

/** Verify a device certificate against the election root key. Throws with reason. */
export function verifyDeviceCert(record: DeviceRecord, caPublicKeyPem: string, stationId: string): void {
  if (!record.cert) throw new Error(`${stationId}: uncertified device (no CA certificate)`);
  let ok = false;
  try {
    ok = verify(
      null, Buffer.from(sha256Hex(certBody(record)), 'hex'),
      createPublicKey(caPublicKeyPem), Buffer.from(record.cert, 'hex'),
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new Error(`${stationId}: device certificate INVALID (binding changed or wrong root)`);
}
