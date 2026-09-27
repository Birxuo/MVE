// Transmission terminal — offline-first result sync (FULL_PLAN §7).
// Stations are offline during voting. After close, the station exports an
// ENCRYPTED bundle (X25519 ECDH to the terminal + AES-256-GCM); the terminal
// decrypts, verifies hashes + device signature, then merges into the national
// aggregate. No network code anywhere — bundles move on removable media.
// File format (.mvepkg, JSON): {v:1, ephemPub, iv, tag, data} all base64/hex.
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, sha256Hex } from '../../election-core/src/crypto-utils.js';
import { DATA_ROOT, ensureDataDirs, loadEvents, loadResults, saveEvents, saveResults } from '../../election-core/src/store.js';
import type { AuditEvent, ResultPackage } from '../../election-core/src/types.js';

export interface TransmissionBundle {
  station: string;
  package: ResultPackage;
  events: AuditEvent[];
  devicePubPem: string;
}

function terminalPaths(root: string): { dir: string; priv: string; pub: string } {
  const dir = join(root, 'terminal');
  return { dir, priv: join(dir, 'terminal.priv.pem'), pub: join(dir, 'terminal.pub.pem') };
}

/** One-time terminal setup: X25519 keypair. Private key never leaves the terminal. */
export function terminalInit(root = DATA_ROOT): string {
  const { dir, priv, pub } = terminalPaths(root);
  mkdirSync(dir, { recursive: true });
  if (existsSync(priv)) return readFileSync(pub, 'utf8');
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o600 });
  writeFileSync(pub, pubPem);
  return pubPem;
}

function boxKey(ownPrivPem: string, peerPubPem: string): Buffer {
  const secret = diffieHellman({
    privateKey: createPrivateKey(ownPrivPem),
    publicKey: createPublicKey(peerPubPem),
  });
  return Buffer.from(hkdfSync('sha256', secret, 'mve-transmission-v1', 'result-sync', 32));
}

/** Station side: seal the station's signed package + events for the terminal. */
export function exportStation(root: string, stationId: string, terminalPubPem: string, outPath: string): void {
  const pkgPath = join(root, 'stations', stationId, 'result.json');
  const devPubPath = join(root, 'stations', stationId, 'device.pub.pem');
  if (!existsSync(pkgPath) || !existsSync(devPubPath)) {
    throw new Error(`${stationId}: nothing to transmit (close the polls first)`);
  }
  const bundle: TransmissionBundle = {
    station: stationId,
    package: JSON.parse(readFileSync(pkgPath, 'utf8')) as ResultPackage,
    events: loadEvents(root).filter((e) => e.stationId === stationId),
    devicePubPem: readFileSync(devPubPath, 'utf8'),
  };
  const eph = generateKeyPairSync('x25519');
  const key = boxKey(eph.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), terminalPubPem);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(bundle);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  writeFileSync(outPath, JSON.stringify({
    v: 1,
    ephemPub: eph.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'),
  }, null, 2) + '\n');
}

/** Terminal side: open, verify (hash + device signature), merge package.
 * Station event chains stay authoritative in station stores; the terminal
 * records only a TRANSMISSION_RECEIVED receipt in its own hash-chained log.
 * The national chain is append-only — history is never rewritten. */
export function importBundle(root: string, pkgPath: string): { station: string; merged: boolean } {
  const { priv } = terminalPaths(root);
  if (!existsSync(priv)) throw new Error('terminal not initialized (run terminal-init)');
  const sealed = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (sealed.v !== 1) throw new Error('unsupported bundle version');
  const key = boxKey(readFileSync(priv, 'utf8'), sealed.ephemPub);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  let bundle: TransmissionBundle;
  try {
    bundle = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final(),
    ]).toString('utf8')) as TransmissionBundle;
  } catch {
    throw new Error('bundle failed authentication (wrong terminal key or tampered file)');
  }
  // Verify before merge: package hash + device signature.
  const { result_hash, signature, ...body } = bundle.package;
  if (sha256Hex(canonical(body)) !== result_hash) throw new Error(`${bundle.station}: package hash mismatch — refused`);
  let sigOk = false;
  try {
    sigOk = verify(
      null, Buffer.from(result_hash ?? '', 'hex'),
      createPublicKey(bundle.devicePubPem), Buffer.from(signature ?? '', 'hex'),
    );
  } catch { sigOk = false; }
  if (!sigOk) throw new Error(`${bundle.station}: device signature invalid — refused`);

  ensureDataDirs(root);
  const existing = loadResults(root).filter((r) => r.polling_station !== bundle.station);
  existing.push(bundle.package);
  saveResults(existing, root);
  const events = loadEvents(root);
  const seq = events.length;
  const ts = new Date().toISOString();
  const prevHash = events.length ? events[events.length - 1].hash : 'GENESIS';
  const receipt: AuditEvent = {
    seq, ts, type: 'TRANSMISSION_RECEIVED', stationId: bundle.station,
    deviceId: bundle.package.device,
    payload: {
      result_hash,
      bundleHash: sha256Hex(readFileSync(pkgPath, 'utf8')),
      stationEvents: bundle.events.length,
    },
    prevHash, hash: '',
  };
  receipt.hash = sha256Hex(prevHash + '|' + canonical({
    seq, ts, type: receipt.type, stationId: receipt.stationId,
    deviceId: receipt.deviceId, payload: receipt.payload,
  }));
  events.push(receipt);
  saveEvents(events, root);
  return { station: bundle.station, merged: true };
}
