// Election management CLI — zero deps. Usage: node dist/services/election-core/src/cli.js <cmd> [--k v]
// Commands: init-election, add-district, add-station, add-candidate, register-voters,
//   open-station, close-station, officer-keygen, officer-sign,
//   ceremony, combine-shares, ca-sign-device, revoke-device, rla-ceremony, seed-demo, status
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { signDeviceBinding } from '../../../voting/client/src/device.js';
import { isApprovedFirmware } from '../../../voting/client/src/firmware.js';
import { canonical, sha256Hex } from './crypto-utils.js';
import { seedFromCeremony, signEvent } from '../../../services/audit/src/index.js';
import { combineShares, splitSecret, toShareFile, shareFileToKeyShare } from './shares.js';
import type { ShareFile } from './shares.js';
import {
  DATA_ROOT, ensureDataDirs, loadCa, loadElection, loadEvents, loadResults, loadRevoked, loadRlaCeremony, loadVoters,
  saveCa, saveCeremony, saveElection, saveEvents, saveRevoked, saveRlaCeremony, saveVoters,
} from './store.js';
import type { AuditEvent } from './types.js';

function args(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const raw = process.argv.slice(3);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const m = a.match(/^--([^=]+)=?(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (m[2] !== '') {
      out[key] = m[2];
    } else if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) {
      out[key] = raw[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function req(a: Record<string, string | true>, k: string): string {
  const v = a[k];
  if (v === undefined || v === true) {
    console.error(`missing --${k}`);
    process.exit(2);
  }
  return String(v);
}

function str(a: Record<string, string | true>, k: string, fallback = ''): string {
  const v = a[k];
  return v === undefined || v === true ? fallback : String(v);
}

function appendEvent(
  type: string, stationId: string, deviceId: string, payload: Record<string, unknown> = {},
  root = DATA_ROOT, privateKeyPem?: string,
): AuditEvent {
  const events = loadEvents(root);
  const seq = events.length;
  const ts = new Date().toISOString();
  const prevHash = events.length ? events[events.length - 1].hash : 'GENESIS';
  const hash = sha256Hex(prevHash + '|' + canonical({ seq, ts, type, stationId, deviceId, payload }));
  const ev: AuditEvent = { seq, ts, type, stationId, deviceId, payload, prevHash, hash };
  if (privateKeyPem) ev.signature = signEvent(hash, privateKeyPem);
  events.push(ev);
  saveEvents(events, root);
  return ev;
}

/** Station device private key, when the booth has opened here at least once. */
function stationKeyFor(root: string, stationId: string): string | undefined {
  const p = joinPath(root, 'stations', stationId, 'device.priv.pem');
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
}

function cmd(): string {
  return process.argv[2] ?? 'status';
}

function main(): void {
  ensureDataDirs();
  const a = args();
  const root = typeof a['data'] === 'string' ? String(a['data']) : DATA_ROOT;
  ensureDataDirs(root);
  const c = cmd();

  if (c === 'init-election') {
    const s = loadElection(root);
    const id = req(a, 'id');
    if (s.elections.some((e) => e.id === id)) throw new Error(`election ${id} exists`);
    s.elections.push({ id, name: String(a['name'] ?? id), date: String(a['date'] ?? ''), status: 'draft' });
    saveElection(s, root);
    console.log(`election ${id} created`);
    return;
  }

  if (c === 'add-district') {
    const s = loadElection(root);
    const id = req(a, 'id');
    s.districts.push({
      id, electionId: String(a['election'] ?? s.elections[0]?.id ?? ''), name: String(a['name'] ?? id), seats: Number(a['seats'] ?? 1),
    });
    saveElection(s, root);
    console.log(`district ${id} added`);
    return;
  }

  if (c === 'add-station') {
    const s = loadElection(root);
    const id = req(a, 'id');
    const device = String(a['device'] ?? `M-${id.slice(-3)}`);
    const firmware = String(a['firmware'] ?? 'sha256:sim-firmware-v1');
    if (!isApprovedFirmware(firmware)) {
      console.error(`warning: ${firmware} is not in the approved firmware manifest — the booth will refuse to open until it is approved`);
    }
    s.stations.push({
      id, districtId: String(a['district'] ?? s.districts[0]?.id ?? ''), name: String(a['name'] ?? id),
      registeredVoters: Number(a['registered'] ?? 0), status: 'closed', deviceId: device,
      firmwareHash: firmware,
    });
    saveElection(s, root);
    console.log(`station ${id} added (device ${device})`);
    return;
  }

  if (c === 'add-candidate') {
    const s = loadElection(root);
    const id = req(a, 'id');
    s.candidates.push({
      id, electionId: String(a['election'] ?? s.elections[0]?.id ?? ''), name: String(a['name'] ?? id), party: String(a['party'] ?? id),
    });
    saveElection(s, root);
    console.log(`candidate ${id} added`);
    return;
  }

  if (c === 'register-voters') {
    const station = req(a, 'station');
    const count = Number(a['count'] ?? 10);
    const s = loadElection(root);
    const st = s.stations.find((x) => x.id === station);
    if (!st) throw new Error(`unknown station ${station}`);
    const voters = loadVoters(root);
    let added = 0;
    for (let i = 0; i < count; i++) {
      const voterId = `${station}-V${String(voters.length + 1).padStart(4, '0')}`;
      if (voters.some((v) => v.voterId === voterId)) continue;
      voters.push({ voterId, districtId: st.districtId, stationId: station, eligible: true, status: 'NOT_VOTED' });
      added++;
    }
    saveVoters(voters, root);
    console.log(`registered ${added} voters at ${station}`);
    return;
  }

  if (c === 'open-station' || c === 'close-station') {
    const station = req(a, 'station');
    const approvals = String(a['approvals'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const need = c === 'open-station' ? 2 : 3;
    if (approvals.length < need) throw new Error(`${c} requires >=${need} approvals (got ${approvals.length})`);
    const s = loadElection(root);
    const st = s.stations.find((x) => x.id === station);
    if (!st) throw new Error(`unknown station ${station}`);
    st.status = c === 'open-station' ? 'open' : 'closed';
    saveElection(s, root);
    const stationKey = stationKeyFor(root, station);
    if (!stationKey) console.error(`warning: no device key for ${station} — event hash-chained only`);
    appendEvent(c === 'open-station' ? 'POLL_OPENED' : 'POLL_CLOSED', station, st.deviceId, { approvals }, root, stationKey);
    console.log(`${station} ${c === 'open-station' ? 'opened' : 'closed'} (${approvals.length} approvals)`);
    return;
  }

  if (c === 'seed-demo') {
    const nStations = Number(a['stations'] ?? 10);
    const nVoters = Number(a['voters'] ?? 50);
    const s = loadElection(root);
    if (!s.elections.some((e) => e.id === '2026-L-SIM')) {
      s.elections.push({ id: '2026-L-SIM', name: 'Tangier mock', date: '2026-09-23', status: 'draft' });
    }
    if (!s.districts.some((d) => d.id === 'TANGER-ASILAH')) {
      s.districts.push({ id: 'TANGER-ASILAH', electionId: '2026-L-SIM', name: 'Tanger-Asilah', seats: 5 });
    }
    for (const cid of ['party_a', 'party_b', 'party_c']) {
      if (!s.candidates.some((x) => x.id === cid)) {
        s.candidates.push({ id: cid, electionId: '2026-L-SIM', name: cid, party: cid });
      }
    }
    const voters = loadVoters(root);
    for (let i = 0; i < nStations; i++) {
      const sid = `TANGER-ASilah-${String(i + 1).padStart(4, '0')}`;
      if (!s.stations.some((x) => x.id === sid)) {
        s.stations.push({
          id: sid, districtId: 'TANGER-ASILAH', name: sid, registeredVoters: nVoters,
          status: 'closed', deviceId: `M-${String(i + 1).padStart(3, '0')}`, firmwareHash: 'sha256:sim-firmware-v1',
        });
      }
      for (let v = 0; v < nVoters; v++) {
        const voterId = `${sid}-V${String(v + 1).padStart(4, '0')}`;
        if (!voters.some((x) => x.voterId === voterId)) {
          voters.push({ voterId, districtId: 'TANGER-ASILAH', stationId: sid, eligible: true, status: 'NOT_VOTED' });
        }
      }
    }
    saveElection(s, root);
    saveVoters(voters, root);
    console.log(`seeded ${nStations} stations x ${nVoters} voters`);
    return;
  }

  if (c === 'officer-keygen') {
    const id = req(a, 'officer');
    const station = str(a, 'station', '');
    const role = str(a, 'role', 'presiding');
    if (!['presiding', 'deputy', 'observer'].includes(role)) throw new Error(`bad role ${role}`);
    const s = loadElection(root);
    let off = s.officers.find((x) => x.id === id);
    if (!off) {
      off = { id, stationId: station, role: role as 'presiding' | 'deputy' | 'observer' };
      s.officers.push(off);
    }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    off.pubkeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    saveElection(s, root);
    console.log(`officer ${id} registered. PRIVATE KEY BELOW — SIMULATION ONLY, store offline:`);
    console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    return;
  }

  if (c === 'officer-sign') {
    const keyFile = req(a, 'key');
    const hash = req(a, 'hash');
    const sig = sign(null, Buffer.from(hash, 'hex'), createPrivateKey(readFileSync(keyFile, 'utf8')));
    console.log(sig.toString('hex'));
    return;
  }

  if (c === 'ceremony') {
    // Witnessed root-key ceremony (docs/security/key-ceremony.md steps 1-2).
    // 2-of-3 split (A1): the private key is Shamir-split into 3 share files and
    // NEVER written as a single file (unless --single-key is passed for migration).
    // Any 2 shares reconstruct via `ca-sign-device --shares a,b` / `combine-shares`.
    const custodians = str(a, 'custodians').split(',').map((x) => x.trim()).filter(Boolean);
    const observer = str(a, 'observer');
    const image = str(a, 'image', 'UNVERIFIED-IMAGE');
    const keyOut = str(a, 'key-out', 'ca.priv.pem');
    const sharesOpt = str(a, 'shares', '');
    const singleKey = a['single-key'] === true || a['single-key'] === 'true' || a['single-key'] === '1';
    if (custodians.length < 2 || !observer) {
      console.error('usage: ceremony --custodians A,B --observer C [--image sha256:...] [--shares PREFIX] [--key-out ca.priv.pem] [--single-key] [--data D]');
      process.exit(2);
    }
    const threshold = 2;
    const total = 3;
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const rootPubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const rootPrivPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const createdAt = new Date().toISOString();
    const base = sharesOpt || keyOut.replace(/(\.priv)?\.pem$/, '') || 'ca';
    const parts = splitSecret(Buffer.from(rootPrivPem, 'utf8'), threshold, total);
    const shareFiles = parts.map((p) => `${base}.share-${p.index}.json`);
    parts.forEach((p, i) => {
      const envelope = toShareFile(p, {
        threshold, total, custodians, observer, imageHash: image, rootPubPem, createdAt,
      });
      writeFileSync(shareFiles[i], JSON.stringify(envelope, null, 2) + '\n', { mode: 0o600 });
    });
    if (singleKey) {
      writeFileSync(keyOut, rootPrivPem, { mode: 0o600 });
      console.error('warning: --single-key wrote a legacy single private key (migration only; prefer shares)');
    } else if (existsSync(keyOut)) {
      console.error(`warning: stale single-key file ${keyOut} left untouched — it is NOT the new root`);
    }
    saveCa({
      createdAt, custodians, observer, imageHash: image,
      rootPubPem, devices: [],
    }, root);
    saveCeremony({
      ts: createdAt, custodians, observer, imageHash: image, rootPubPem,
      threshold, total, shareFiles,
    }, root);
    appendEvent('CEREMONY', 'NATIONAL', 'CA', { custodians, observer, imageHash: image, threshold, total }, root, rootPrivPem);
    console.log(`ceremony recorded (2-of-3). Root public key in ${root}/ca/ca.json; shares ONLY in:`);
    for (const f of shareFiles) console.log(`  ${f}`);
    console.log('any 2 shares reconstruct via: manage combine-shares --shares <a,b> / ca-sign-device --shares <a,b>');
    return;
  }

  if (c === 'rla-ceremony') {
    // Publish the witnessed RLA randomness hex (docs/auditing/risk-limiting-audit.md).
    // Publish BEFORE results exist: the hex binds every later audit sample, so no
    // one can shop for a favorable seed after seeing the outcome. Immutable once
    // recorded — corrections need a new supervised publication, never silent edit.
    const hex = str(a, 'hex').trim().toLowerCase();
    const by = str(a, 'by', 'observer') || 'observer';
    if (!hex) {
      console.error('usage: rla-ceremony --hex <≥16 hex chars, witnessed> [--by NAME] [--data D]');
      process.exit(2);
    }
    const seed = seedFromCeremony(hex); // throws on malformed input
    const existing = loadRlaCeremony(root);
    if (existing) {
      if (existing.hex !== hex) {
        throw new Error(
          `RLA ceremony already published (hex ${existing.hex.slice(0, 8)}… by ${existing.publishedBy} at ${existing.publishedAt}) — refusing overwrite`,
        );
      }
      console.log(`rla ceremony already recorded (seed ${existing.seed}) — idempotent replay`);
      return;
    }
    const rec = { hex, seed, publishedAt: new Date().toISOString(), publishedBy: by.slice(0, 120) };
    saveRlaCeremony(rec, root);
    appendEvent('RLA_CEREMONY', 'NATIONAL', 'CA', { hexPreview: hex.slice(0, 8), by: rec.publishedBy }, root);
    console.log(`rla ceremony published: hex ${hex.slice(0, 8)}… → seed ${seed} (recorded in ${root}/audit/rla-ceremony.json)`);
    return;
  }

  if (c === 'combine-shares') {
    // Disaster-recovery / operator helper: reconstruct the root private key from shares.
    const list = str(a, 'shares').split(',').map((x) => x.trim()).filter(Boolean);
    const out = str(a, 'out', '');
    const pubkeyFile = str(a, 'pubkey', '');
    if (list.length < 2) {
      console.error('usage: combine-shares --shares <shareA,shareB[,shareC]> [--out reconstructed.pem] [--pubkey root.pub.pem]');
      process.exit(2);
    }
    const envelopes = list.map((f) => JSON.parse(readFileSync(f, 'utf8')) as ShareFile);
    const threshold = envelopes[0]?.threshold ?? 2;
    const secret = combineShares(envelopes.map(shareFileToKeyShare), threshold);
    const privPem = secret.toString('utf8');
    if (!privPem.includes('PRIVATE KEY')) throw new Error('share reconstruction failed (not a private key)');
    if (pubkeyFile) {
      const expected = readFileSync(pubkeyFile, 'utf8').trim();
      const derived = createPublicKey(createPrivateKey(privPem)).export({ type: 'spki', format: 'pem' }).toString().trim();
      if (derived !== expected) throw new Error('reconstructed key does not match expected public key');
    }
    if (out) {
      writeFileSync(out, privPem.endsWith('\n') ? privPem : privPem + '\n', { mode: 0o600 });
      console.log(`reconstructed root key to ${out} (2-share quorum used)`);
    } else {
      console.log(privPem);
    }
    return;
  }

  function resolveCaPrivKey(): string {
    const keyFile = str(a, 'key', '');
    const sharesList = str(a, 'shares').split(',').map((x) => x.trim()).filter(Boolean);
    const altA = str(a, 'share-a', '');
    const altB = str(a, 'share-b', '');
    const shareFiles = sharesList.length ? sharesList : [altA, altB].filter(Boolean);
    if (keyFile && shareFiles.length) throw new Error('pass --key OR --shares, not both');
    if (keyFile) return readFileSync(keyFile, 'utf8');
    if (shareFiles.length >= 2) {
      const envelopes = shareFiles.map((f) => JSON.parse(readFileSync(f, 'utf8')) as ShareFile);
      const threshold = envelopes[0]?.threshold ?? 2;
      const privPem = combineShares(envelopes.map(shareFileToKeyShare), threshold).toString('utf8');
      if (!privPem.includes('PRIVATE KEY')) throw new Error('share reconstruction failed (not a private key)');
      return privPem;
    }
    throw new Error('ca-sign-device needs --key <root.pem> (legacy) or --shares <shareA,shareB> (2-of-3 quorum)');
  }

  if (c === 'ca-sign-device') {
    // Ceremony step 3: bind a station device to the election root.
    const station = req(a, 'station');
    const s = loadElection(root);
    const st = s.stations.find((x) => x.id === station);
    if (!st) throw new Error(`unknown station ${station}`);
    const ca = loadCa(root);
    if (!ca) throw new Error('no CA in this store (run ceremony first)');
    const recPath = joinPath(root, 'stations', station, 'device.json');
    if (!existsSync(recPath)) throw new Error(`${station}: no device record (open the polls once first)`);
    const record = JSON.parse(readFileSync(recPath, 'utf8'));
    const caPriv = resolveCaPrivKey();
    // Quorum guard: the signing key must derive the published election root.
    const derivedPub = createPublicKey(createPrivateKey(caPriv)).export({ type: 'spki', format: 'pem' }).toString().trim();
    if (derivedPub !== ca.rootPubPem.trim()) {
      throw new Error(`${station}: signing key is not the election root (wrong shares or wrong key)`);
    }
    record.cert = signDeviceBinding(record, caPriv);
    writeFileSync(recPath, JSON.stringify(record, null, 2) + '\n');
    ca.devices = ca.devices.filter((d) => d.station !== station);
    ca.devices.push({
      station, deviceId: record.deviceId, firmwareHash: record.firmwareHash,
      devicePub: record.publicKeyPem, cert: record.cert,
    });
    saveCa(ca, root);
    appendEvent('DEVICE_CERTIFIED', station, 'CA', { station, device: record.deviceId }, root, caPriv);
    console.log(`${station}: device ${record.deviceId} certified by election root`);
    return;
  }

  if (c === 'revoke-device') {
    const device = req(a, 'device');
    const reason = req(a, 'reason');
    const by = str(a, 'by', 'security-authority');
    const list = loadRevoked(root);
    if (!list.some((r) => r.deviceId === device)) {
      const s = loadElection(root);
      const st = s.stations.find((x) => x.deviceId === device);
      list.push({ deviceId: device, stationId: st?.id ?? 'unknown', reason, ts: new Date().toISOString(), revokedBy: by });
      saveRevoked(list, root);
      // Authority attestation: sign with the election root when a quorum key is
      // supplied (--key legacy or --shares pair); otherwise hash-chained only.
      let rootKey: string | undefined;
      try {
        rootKey = resolveCaPrivKey();
      } catch { rootKey = undefined; }
      const ca = loadCa(root);
      if (rootKey && ca) {
        const derivedPub = createPublicKey(createPrivateKey(rootKey)).export({ type: 'spki', format: 'pem' }).toString().trim();
        if (derivedPub !== ca.rootPubPem.trim()) throw new Error('revocation key is not the election root');
      } else {
        if (ca) console.error('warning: no root quorum given — revocation hash-chained only (pass --shares A,B)');
        rootKey = undefined;
      }
      appendEvent('DEVICE_REVOKED', st?.id ?? 'unknown', 'CA', { device, reason }, root, rootKey);
    }
    console.log(`${device} revoked (${reason}) — verify paths now treat its packages as INVALID`);
    return;
  }

  // status (default)
  const s = loadElection(root);
  const voters = loadVoters(root);
  const results = loadResults(root);
  console.log(JSON.stringify({
    elections: s.elections.length, districts: s.districts.length, stations: s.stations.length,
    candidates: s.candidates.map((x) => x.id), voters: voters.length, results: results.length,
  }, null, 2));
}

main();
