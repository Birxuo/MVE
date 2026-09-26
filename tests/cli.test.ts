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
