// Election management CLI — zero deps. Usage: node dist/services/election-core/src/cli.js <cmd> [--k v]
// Commands: init-election, add-district, add-station, add-candidate, register-voters,
//   open-station, close-station, seed-demo, status
import { canonical, sha256Hex } from './crypto-utils.js';
import {
  DATA_ROOT, ensureDataDirs, loadElection, loadEvents, loadResults, loadVoters,
  saveElection, saveEvents, saveVoters,
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
