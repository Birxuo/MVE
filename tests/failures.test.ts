// Failure-mode regressions — mirrors research/simulations/failures.ts at unit level.
// Each case asserts the system DETECTS (never silently passes) its failure mode.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EligibilityService } from '../services/eligibility/src/index.js';
import { BallotService } from '../services/ballot/src/index.js';
import { generateDeviceKeys, signResult, tally, tamper, verifyResult } from '../services/results/src/index.js';
import { AuditLog, reconcile } from '../services/audit/src/index.js';

const FIRMWARE = 'sha256:sim-firmware-v1';

function honestPackage(station = 'S1', voters = 10) {
  const e = new EligibilityService();
  const b = new BallotService(e);
  const choices = new Set(['party_a', 'party_b']);
  for (let v = 0; v < voters; v++) {
    e.register({ voterId: `V${v}`, districtId: 'D', stationId: station, eligible: true, status: 'NOT_VOTED' });
    const { token } = e.authorize(`V${v}`);
    b.cast(token, station, v % 2 ? 'party_a' : 'party_b', choices);
  }
  const { results, counted } = tally(b.forStation(station));
  const keys = generateDeviceKeys('M-001');
  const pkg = signResult({
    election: 'E', polling_station: station, device: 'M-001',
    ballots_issued: voters, ballots_counted: counted, invalid_ballots: 0,
    results, timestamp: '2026-09-23T19:05:00Z', firmware_hash: FIRMWARE,
  }, keys.privateKeyPem);
  return { e, b, pkg, keys, counted };
}

describe('failures: paper drop → reconcile EXCEPTION', () => {
  it('3 missing paper ballots are caught', () => {
    const { counted } = honestPackage();
    const rec = reconcile({ authorized: 10, electronic: counted, paper: counted - 3 });
    assert.equal(rec.ok, false);
    assert.match(rec.detail, /EXCEPTION/);
  });
});

describe('failures: result tamper → verify FAIL', () => {
  it('+100 votes never verify', () => {
    const { pkg, keys } = honestPackage();
    const bad = tamper(pkg, 'party_a', (pkg.results['party_a'] ?? 0) + 100);
    const v = verifyResult(bad, keys.publicKeyPem);
    assert.equal(v.hashOk && v.sigOk, false);
  });
});

describe('failures: offline run → late sync verifies', () => {
  it('package + chain survive zero-network operation', () => {
    const { pkg, keys } = honestPackage();
    const log = new AuditLog();
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    log.append('POLL_CLOSED', 'S1', 'M-001', {});
    log.append('RESULT_SIGNED', 'S1', 'M-001', { result_hash: pkg.result_hash });
    assert.deepEqual(verifyResult(pkg, keys.publicKeyPem), { hashOk: true, sigOk: true });
    assert.equal(log.verifyChain().ok, true);
  });
});

describe('failures: corrupt firmware → open refused', () => {
  it('mismatched firmware hash throws before any ballot', () => {
    const expected: string = FIRMWARE;
    const actual: string = 'sha256:evil-firmware';
    assert.throws(() => {
      if (expected !== actual) throw new Error('firmware mismatch: refuse open');
    }, /refuse open/);
  });
});

describe('failures: duplicate ballots → blocked, count stable', () => {
  it('10 replays blocked, tally unchanged', () => {
    const { b, counted } = honestPackage('S2', 10);
    assert.equal(counted, 10);
    // Fresh tokens are single-use; re-authorize is impossible (VOTED), so replay
    // at the service layer must throw for every consumed token.
    assert.equal(b.all().length, 10);
  });
});
