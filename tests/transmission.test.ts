import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDataDirs, loadEvents, loadResults, saveElection, saveEvents, saveResults, saveVoters } from '../services/election-core/src/store.js';
import { exportStation, importBundle, terminalInit } from '../services/transmission/src/index.js';
import { generateDeviceKeys, signResult } from '../services/results/src/index.js';

const FW = 'sha256:x';

function stationRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'mve-tx-station-'));
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'closed' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: [{ id: 'S1', districtId: 'D1', name: 'S1', registeredVoters: 5, status: 'closed', deviceId: 'M-001', firmwareHash: FW }],
    candidates: [{ id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' }],
    officers: [],
  }, root);
  saveVoters([{ voterId: 'V1', districtId: 'D1', stationId: 'S1', eligible: true, status: 'VOTED' }], root);
  const keys = generateDeviceKeys('M-001');
  const pkg = signResult({
    election: 'E1', polling_station: 'S1', device: 'M-001',
    ballots_issued: 1, ballots_counted: 1, invalid_ballots: 0,
    results: { party_a: 1 }, timestamp: '2026-09-23T19:05:00Z', firmware_hash: FW,
  }, keys.privateKeyPem);
  saveResults([pkg], root);
  saveEvents([{ seq: 0, ts: '2026-09-23T19:00:00Z', type: 'POLL_CLOSED', stationId: 'S1', deviceId: 'M-001', payload: {}, prevHash: 'GENESIS', hash: 'abc' }], root);
  mkdirSync(join(root, 'stations', 'S1'), { recursive: true });
  writeFileSync(join(root, 'stations', 'S1', 'result.json'), JSON.stringify(pkg));
  writeFileSync(join(root, 'stations', 'S1', 'device.pub.pem'), keys.publicKeyPem);
  return root;
}

describe('transmission: sealed export → verified import', () => {
  it('round-trips offline; wrong key and tampered files are refused', () => {
    const station = stationRoot();
    const national = mkdtempSync(join(tmpdir(), 'mve-tx-national-'));
    const tpub = terminalInit(national);
    const out = join(station, 'S1.mvepkg');
    exportStation(station, 'S1', tpub, out);

    const { station: s, merged } = importBundle(national, out);
    assert.equal(s, 'S1');
    assert.equal(merged, true);
    assert.equal(loadResults(national)[0].polling_station, 'S1');
    const events = loadEvents(national);
    assert.ok(events.some((e) => e.type === 'TRANSMISSION_RECEIVED'));

    // Wrong terminal key cannot open the bundle.
    const other = mkdtempSync(join(tmpdir(), 'mve-tx-other-'));
    terminalInit(other);
    assert.throws(() => importBundle(other, out), /authentication|refused/);

    // Bit-flip the sealed file → authentication failure.
    const raw = readFileSync(out, 'utf8');
    const flipAt = Math.floor(raw.length / 2);
    const flipped = raw.slice(0, flipAt) + (raw[flipAt] === 'A' ? 'B' : 'A') + raw.slice(flipAt + 1);
    writeFileSync(out, flipped);
    assert.throws(() => importBundle(national, out), /authentication|refused/);
  });

  it('export refuses unclosed stations', () => {
    const station = stationRoot();
    const national = mkdtempSync(join(tmpdir(), 'mve-tx-national2-'));
    const tpub = terminalInit(national);
    rmSync(join(station, 'stations', 'S1', 'result.json'));
    assert.throws(() => exportStation(station, 'S1', tpub, join(station, 'x.mvepkg')), /nothing to transmit/);
  });
});
