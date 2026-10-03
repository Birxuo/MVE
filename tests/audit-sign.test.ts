import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog, auditCoverage, signEvent, verifyEventChain } from '../services/audit/src/index.js';
import { generateDeviceKeys } from '../services/results/src/index.js';

describe('audit signatures', () => {
  it('signed events verify; forged signature fails at its seq', () => {
    const keys = generateDeviceKeys('M-001');
    const log = new AuditLog((hash) => signEvent(hash, keys.privateKeyPem));
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    log.append('BALLOT_CAST', 'S1', 'M-001', {});
    log.append('POLL_CLOSED', 'S1', 'M-001', {});
    assert.ok(log.all().every((e) => e.signature));
    assert.deepEqual(log.verifyChain(new Map([['M-001', keys.publicKeyPem]])), { ok: true });
    // Wrong key → signature invalid.
    const other = generateDeviceKeys('M-999');
    assert.equal(log.verifyChain(new Map([['M-001', other.publicKeyPem]])).ok, false);
    // Forged payload → hash break at seq 1.
    const copy = JSON.parse(JSON.stringify(log.all()));
    copy[1].payload = { forged: true };
    assert.deepEqual(verifyEventChain(copy, new Map([['M-001', keys.publicKeyPem]])), { ok: false, badSeq: 1 });
  });

  it('unsigned legacy events still verify on hash-chain alone', () => {
    const log = new AuditLog();
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    assert.deepEqual(log.verifyChain(), { ok: true });
    assert.deepEqual(log.verifyChain(new Map()), { ok: true });
  });
});

describe('audit replication', () => {
  it('fork verifies independently; tampered replica is caught', () => {
    const keys = generateDeviceKeys('M-002');
    const log = new AuditLog((hash) => signEvent(hash, keys.privateKeyPem));
    for (let i = 0; i < 10; i++) log.append('HEARTBEAT', 'S1', 'M-002', { n: i });
    const replica = log.fork();
    assert.deepEqual(verifyEventChain(replica, new Map([['M-002', keys.publicKeyPem]])), { ok: true });
    replica[5].payload = { n: 'evil' };
    const v = verifyEventChain(replica, new Map([['M-002', keys.publicKeyPem]]));
    assert.equal(v.ok, false);
    assert.equal(v.badSeq, 5);
    // Original untouched.
    assert.deepEqual(log.verifyChain(new Map([['M-002', keys.publicKeyPem]])), { ok: true });
  });
});

describe('audit coverage (strict verify)', () => {
  it('fully-signed chain reports zero unsigned/invalid; tampering flags the seq', () => {
    const keys = generateDeviceKeys('M-001');
    const log = new AuditLog((hash) => signEvent(hash, keys.privateKeyPem));
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    log.append('INCIDENT_REPORTED', 'S1', 'M-001', { id: 'INC-0001' });
    const verifiers = new Map([['M-001', keys.publicKeyPem]]);
    assert.deepEqual(auditCoverage(log.all(), verifiers), { total: 2, signed: 2, unsigned: [], invalid: [] });
    // Forged payload: the hash chain catches it (stored hash no longer recomputes).
    const forged = JSON.parse(JSON.stringify(log.all()));
    forged[1].payload = { id: 'INC-9999' };
    assert.deepEqual(verifyEventChain(forged, verifiers), { ok: false, badSeq: 1 });
    // Corrupted signature bytes: coverage flags the seq as invalid.
    const clipped = JSON.parse(JSON.stringify(log.all()));
    clipped[1].signature = '00' + clipped[1].signature.slice(2);
    assert.deepEqual(auditCoverage(clipped, verifiers).invalid, [1]);
  });

  it('hash-only legacy events are listed as unsigned (non-strict still verifies)', () => {
    const log = new AuditLog();
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    assert.deepEqual(verifyEventChain(log.all()), { ok: true });
    assert.deepEqual(auditCoverage(log.all(), new Map()).unsigned, [0]);
  });

  it('CA-issued events verify under the election root; wrong-role keys fail', () => {
    const root = generateDeviceKeys('CA');
    const device = generateDeviceKeys('M-001');
    const log = new AuditLog((hash, id) =>
      id === 'CA' ? signEvent(hash, root.privateKeyPem) : signEvent(hash, device.privateKeyPem));
    log.append('CEREMONY', 'NATIONAL', 'CA', { custodians: ['A', 'B'] });
    log.append('DEVICE_CERTIFIED', 'S1', 'CA', { station: 'S1' });
    log.append('POLL_OPENED', 'S1', 'M-001', {});
    const verifiers = new Map([['CA', root.publicKeyPem], ['M-001', device.publicKeyPem]]);
    assert.deepEqual(log.verifyChain(verifiers), { ok: true });
    assert.deepEqual(auditCoverage(log.all(), verifiers).invalid, []);
    // Same events checked against a rogue root: CA signatures go invalid.
    const rogue = generateDeviceKeys('ROGUE-CA');
    const cov = auditCoverage(log.all(), new Map([['CA', rogue.publicKeyPem], ['M-001', device.publicKeyPem]]));
    assert.deepEqual(cov.invalid, [0, 1]);
  });
});
