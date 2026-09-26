import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EligibilityService } from '../services/eligibility/src/index.js';
import { BallotService } from '../services/ballot/src/index.js';
import { generateDeviceKeys, signResult, verifyResult, tamper } from '../services/results/src/index.js';
import { AuditLog, reconcile } from '../services/audit/src/index.js';

const choices = new Set(['party_a', 'party_b']);

function setup() {
  const e = new EligibilityService();
  e.register({ voterId: 'V1', districtId: 'D', stationId: 'S1', eligible: true, status: 'NOT_VOTED' });
  e.register({ voterId: 'V2', districtId: 'D', stationId: 'S1', eligible: true, status: 'NOT_VOTED' });
  return { e, b: new BallotService(e) };
}

describe('eligibility: no double vote', () => {
  it('second authorize throws', () => {
    const { e } = setup();
    e.authorize('V1');
    assert.throws(() => e.authorize('V1'), /double vote/);
  });
});

describe('ballot: token replay blocked, no voter link', () => {
  it('same token cannot cast twice', () => {
    const { e, b } = setup();
    const { token } = e.authorize('V1');
    b.cast(token, 'S1', 'party_a', choices);
    assert.throws(() => b.cast(token, 'S1', 'party_a', choices), /duplicate ballot|already consumed/);
  });
  it('ballot record has no voterId field', () => {
    const { e, b } = setup();
    const { token } = e.authorize('V2');
    const ballot = b.cast(token, 'S1', 'party_b', choices) as unknown as Record<string, unknown>;
    assert.ok(!('voterId' in ballot) && !('voter_id' in ballot) && !('cin' in ballot));
  });
});

describe('results: tamper invalidates hash/sig', () => {
  it('201->301 breaks verification', () => {
    const keys = generateDeviceKeys('M-001');
    const pkg = signResult({
      election: 'E', polling_station: 'S1', device: 'M-001',
      ballots_issued: 487, ballots_counted: 487, invalid_ballots: 0,
      results: { party_a: 201 }, timestamp: '2026-09-23T19:05:00Z', firmware_hash: 'sha256:x',
    }, keys.privateKeyPem);
    assert.deepEqual(verifyResult(pkg, keys.publicKeyPem), { hashOk: true, sigOk: true });
    const bad = tamper(pkg, 'party_a', 301);
    const v = verifyResult(bad, keys.publicKeyPem);
    // Tamper keeps old hash+sig: sig still matches stored hash, but body hash mismatches → detected.
    assert.equal(v.hashOk, false);
    assert.equal(v.hashOk && v.sigOk, false);
  });
});

describe('audit: chain + reconciliation', () => {
  it('chain verifies; reconcile catches mismatch', () => {
    const log = new AuditLog();
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    log.append('RESULT_SIGNED', 'S1', 'M-001', {});
    assert.equal(log.verifyChain().ok, true);
    assert.equal(reconcile({ authorized: 512, electronic: 509, paper: 509 }).ok, true);
    assert.equal(reconcile({ authorized: 512, electronic: 509, paper: 495 }).ok, false);
  });
});
