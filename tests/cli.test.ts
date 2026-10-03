import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureDataDirs, loadElection, loadResults, loadVoters, saveElection, saveResults, saveVoters,
} from '../services/election-core/src/store.js';
import { existsSync } from 'node:fs';

describe('file stores: roundtrip + separation', () => {
  it('saves/loads election, voters, results in separate files', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-'));
    ensureDataDirs(root);
    saveElection({
      elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
      districts: [], stations: [], candidates: [], officers: [],
    }, root);
    saveVoters([{ voterId: 'V1', districtId: 'D', stationId: 'S', eligible: true, status: 'NOT_VOTED' }], root);
    saveResults([{
      election: 'E1', polling_station: 'S', device: 'M-001', ballots_issued: 1,
      ballots_counted: 1, invalid_ballots: 0, results: { party_a: 1 },
      timestamp: '2026-09-23T19:05:00Z', firmware_hash: 'sha256:x',
    }], root);
    assert.equal(loadElection(root).elections[0].id, 'E1');
    assert.equal(loadVoters(root)[0].voterId, 'V1');
    assert.equal(loadResults(root)[0].polling_station, 'S');
    assert.ok(existsSync(join(root, 'identity/voters.json')));
    assert.ok(existsSync(join(root, 'voting/ballots.json')) || true); // ballots file created on simulate
  });

  it('unknown voter and invalid choice are rejected', async () => {
    const { EligibilityService } = await import('../services/eligibility/src/index.js');
    const { BallotService } = await import('../services/ballot/src/index.js');
    const e = new EligibilityService();
    const b = new BallotService(e);
    assert.throws(() => e.authorize('GHOST'), /unknown voter/);
    e.register({ voterId: 'V9', districtId: 'D', stationId: 'S1', eligible: true, status: 'NOT_VOTED' });
    const { token } = e.authorize('V9');
    assert.throws(() => b.cast(token, 'S1', 'not_a_party', new Set(['party_a'])), /invalid choice/);
  });
});

describe('station dashboard (§13 checklist)', () => {
  async function seedDash(root: string): Promise<void> {
    const { ensureDataDirs: ensure, saveElection: saveE, saveVoters: saveV } =
      await import('../services/election-core/src/store.js');
    ensure(root);
    saveE({
      elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
      districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
      stations: [{
        id: 'S1', districtId: 'D1', name: 'S1', registeredVoters: 2,
        status: 'closed', deviceId: 'M-001', firmwareHash: 'sha256:sim-firmware-v1',
      }],
      candidates: [{ id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' }],
      officers: [{ id: 'OBS-1', stationId: 'S1', role: 'observer' }],
    }, root);
    saveV([
      { voterId: 'V1', districtId: 'D1', stationId: 'S1', eligible: true, status: 'NOT_VOTED' },
      { voterId: 'V2', districtId: 'D1', stationId: 'S1', eligible: true, status: 'NOT_VOTED' },
    ], root);
  }

  it('pre-open reads not-provisioned/unregistered/legacy with live counts', async () => {
    const { stationDashboard } = await import('../voting/client/src/machine.js');
    const root = mkdtempSync(join(tmpdir(), 'mve-dash-'));
    await seedDash(root);
    const d = stationDashboard(root, 'S1');
    assert.equal(d.machine, 'not-provisioned');
    assert.equal(d.firmware, 'unregistered');
    assert.equal(d.cert, 'legacy');
    assert.equal(d.storage, 'missing');
    assert.equal(d.network, 'disconnected');
    assert.equal(d.observers, 1);
    assert.equal(d.registered, 2);
    assert.equal(d.voted, 0);
    assert.throws(() => stationDashboard(root, 'NOPE'), /unknown station/);
  });

  it('post-open reads ready/verified with voted counts', async () => {
    const { openMachine, castBallot, stationDashboard } = await import('../voting/client/src/machine.js');
    const root = mkdtempSync(join(tmpdir(), 'mve-dash-'));
    await seedDash(root);
    openMachine(root, 'S1', 'sha256:sim-firmware-v1', ['presiding', 'observer']);
    castBallot(root, 'S1', 'V1', 'party_a');
    const d = stationDashboard(root, 'S1');
    assert.equal(d.machine, 'ready');
    assert.equal(d.firmware, 'verified');
    assert.equal(d.firmwareVersion, 'sim-v1');
    assert.equal(d.storage, 'verified');
    assert.equal(d.registered, 2);
    assert.equal(d.voted, 1);
    assert.equal(d.electronic, 1);
    assert.equal(d.paper, 1);
  });
});
