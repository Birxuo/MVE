import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  ensureDataDirs, loadElection, loadRevoked, saveCa, saveElection, saveRevoked, saveVoters,
} from '../services/election-core/src/store.js';
import { signDeviceBinding, verifyDeviceCert } from '../voting/client/src/device.js';
import { openMachine } from '../voting/client/src/machine.js';
import { generateDeviceKeys } from '../services/results/src/index.js';

const FW = 'sha256:test-fw';

function seed(root: string): void {
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: [{
      id: 'S1', districtId: 'D1', name: 'S1', registeredVoters: 1,
      status: 'closed', deviceId: 'M-001', firmwareHash: FW,
    }],
    candidates: [{ id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' }],
    officers: [],
  }, root);
  saveVoters([{ voterId: 'V1', districtId: 'D1', stationId: 'S1', eligible: true, status: 'NOT_VOTED' as const }], root);
}

describe('pki: ceremony, certs, fail-closed opening', () => {
  it('uncertified device opens legacy; certified election refuses uncertified devices', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-pki-'));
    seed(root);
    // No CA: legacy procedural path.
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    assert.equal(JSON.parse(readFileSync(join(root, 'audit', 'events.json'), 'utf8')).length, 1);

    // Publish a CA: the same uncertified device must now refuse.
    const caKeys = generateDeviceKeys('CA');
    saveCa({
      createdAt: new Date().toISOString(), custodians: ['A', 'B'], observer: 'C',
      imageHash: 'sha256:test-image', rootPubPem: caKeys.publicKeyPem, devices: [],
    }, root);
    // Reset station to closed for a second open attempt.
    const elected = loadElection(root);
    elected.stations[0].status = 'closed';
    saveElection(elected, root);
    assert.throws(() => openMachine(root, 'S1', FW, ['presiding', 'observer']), /uncertified/);
  });

  it('cert signs the binding; firmware change after cert breaks it', () => {
    const keys = generateDeviceKeys('M-001');
    const caKeys = generateDeviceKeys('CA');
    const record = {
      deviceId: 'M-001', stationId: 'S1', firmwareHash: FW,
      publicKeyPem: keys.publicKeyPem, boundAt: '2026-09-23T00:00:00Z',
    };
    const cert = signDeviceBinding(record, caKeys.privateKeyPem);
    assert.doesNotThrow(() => verifyDeviceCert({ ...record, cert }, caKeys.publicKeyPem, 'S1'));
    assert.throws(
      () => verifyDeviceCert({ ...record, cert, firmwareHash: 'sha256:evil' }, caKeys.publicKeyPem, 'S1'),
      /INVALID/,
    );
    const other = generateDeviceKeys('ROGUE-CA');
    assert.throws(() => verifyDeviceCert({ ...record, cert }, other.publicKeyPem, 'S1'), /INVALID/);
    assert.throws(() => verifyDeviceCert(record, caKeys.publicKeyPem, 'S1'), /uncertified/);
  });

  it('revocation store round-trips', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-pki-rev-'));
    ensureDataDirs(root);
    saveRevoked([{ deviceId: 'M-007', stationId: 'S9', reason: 'lost seal', ts: '2026-09-23T00:00:00Z', revokedBy: 'sec' }], root);
    assert.deepEqual(loadRevoked(root).map((r) => r.deviceId), ['M-007']);
  });
});

describe('pki: bundle honors revoked.csv', () => {
  it('revoked station verifies INVALID from dataset alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mve-pki-bundle-'));
    const body = {
      election: 'E1', polling_station: 'S1', device: 'M-001',
      ballots_issued: 2, ballots_counted: 2, invalid_ballots: 0,
      results: { party_a: 2 }, timestamp: '2026-09-23T19:05:00Z', firmware_hash: 'sha256:x',
    };
    const canon = `{"ballots_counted":2,"ballots_issued":2,"device":"M-001","election":"E1",` +
      `"firmware_hash":"sha256:x","invalid_ballots":0,"polling_station":"S1",` +
      `"results":{"party_a":2},"timestamp":"2026-09-23T19:05:00Z"}`;
    void body;
    const hash = createHash('sha256').update(canon).digest('hex');
    writeFileSync(join(dir, 'results.csv'),
      'election,station,device,ballots_issued,counted,invalid,party_a,timestamp,firmware_hash,result_hash,signature,audit\n' +
      `E1,S1,M-001,2,2,0,2,2026-09-23T19:05:00Z,sha256:x,${hash},00,PENDING\n`);
    let r = spawnSync(process.execPath, [join(process.cwd(), 'apps/verification/verify-bundle.js'), '--dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout);
    writeFileSync(join(dir, 'revoked.csv'), 'device,station,reason,ts,revokedBy\nM-001,S1,lost seal,2026-09-23T00:00:00Z,sec\n');
    r = spawnSync(process.execPath, [join(process.cwd(), 'apps/verification/verify-bundle.js'), '--dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 3);
    assert.match(r.stdout, /REVOKED/);
  });
});
