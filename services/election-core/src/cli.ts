// Election management CLI — zero deps. Usage: node dist/services/election-core/src/cli.js <cmd> [--k v]
// Commands: init-election, add-district, add-station, add-candidate, register-voters,
//   open-station, close-station, officer-keygen, officer-sign,
//   ceremony, ca-sign-device, revoke-device, seed-demo, status
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { signDeviceBinding } from '../../../voting/client/src/device.js';
import { canonical, sha256Hex } from './crypto-utils.js';
import {
  DATA_ROOT, ensureDataDirs, loadCa, loadElection, loadEvents, loadResults, loadRevoked, loadVoters,
  saveCa, saveCeremony, saveElection, saveEvents, saveRevoked, saveVoters,
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
  root = DATA_ROOT,
): AuditEvent {
  const events = loadEvents(root);
  const seq = events.length;
  const ts = new Date().toISOString();
  const prevHash = events.length ? events[events.length - 1].hash : 'GENESIS';
  const hash = sha256Hex(prevHash + '|' + canonical({ seq, ts, type, stationId, deviceId, payload }));
  const ev: AuditEvent = { seq, ts, type, stationId, deviceId, payload, prevHash, hash };
  events.push(ev);
  saveEvents(events, root);
  return ev;
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
    s.stations.push({
      id, districtId: String(a['district'] ?? s.districts[0]?.id ?? ''), name: String(a['name'] ?? id),
      registeredVoters: Number(a['registered'] ?? 0), status: 'closed', deviceId: device,
      firmwareHash: String(a['firmware'] ?? 'sha256:sim-firmware-v1'),
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
    appendEvent(c === 'open-station' ? 'POLL_OPENED' : 'POLL_CLOSED', station, st.deviceId, { approvals }, root);
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
    // Custodians + observer are recorded; the private key goes ONLY to --key-out.
    const custodians = str(a, 'custodians').split(',').map((x) => x.trim()).filter(Boolean);
    const observer = str(a, 'observer');
    const image = str(a, 'image', 'UNVERIFIED-IMAGE');
    const keyOut = str(a, 'key-out', 'ca.priv.pem');
    if (custodians.length < 2 || !observer) {
      console.error('usage: ceremony --custodians A,B --observer C [--image sha256:...] [--key-out ca.priv.pem] [--data D]');
      process.exit(2);
    }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const rootPubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    writeFileSync(keyOut, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o600 });
    saveCa({
      createdAt: new Date().toISOString(), custodians, observer, imageHash: image,
      rootPubPem, devices: [],
    }, root);
    saveCeremony({
      ts: new Date().toISOString(), custodians, observer, imageHash: image, rootPubPem,
    }, root);
    appendEvent('CEREMONY', 'NATIONAL', 'CA', { custodians, observer, imageHash: image }, root);
    console.log(`ceremony recorded. Root public key in ${root}/ca/ca.json; private key ONLY in ${keyOut}`);
    return;
  }

  if (c === 'ca-sign-device') {
    // Ceremony step 3: bind a station device to the election root.
    const station = req(a, 'station');
    const keyFile = req(a, 'key');
    const s = loadElection(root);
    const st = s.stations.find((x) => x.id === station);
    if (!st) throw new Error(`unknown station ${station}`);
    const ca = loadCa(root);
    if (!ca) throw new Error('no CA in this store (run ceremony first)');
    const recPath = joinPath(root, 'stations', station, 'device.json');
    if (!existsSync(recPath)) throw new Error(`${station}: no device record (open the polls once first)`);
    const record = JSON.parse(readFileSync(recPath, 'utf8'));
    const caPriv = readFileSync(keyFile, 'utf8');
    record.cert = signDeviceBinding(record, caPriv);
    writeFileSync(recPath, JSON.stringify(record, null, 2) + '\n');
    ca.devices = ca.devices.filter((d) => d.station !== station);
    ca.devices.push({
      station, deviceId: record.deviceId, firmwareHash: record.firmwareHash,
      devicePub: record.publicKeyPem, cert: record.cert,
    });
    saveCa(ca, root);
    appendEvent('DEVICE_CERTIFIED', station, record.deviceId, { station }, root);
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
      appendEvent('DEVICE_REVOKED', st?.id ?? 'unknown', device, { reason }, root);
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
