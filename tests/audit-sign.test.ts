import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog, signEvent, verifyEventChain } from '../services/audit/src/index.js';
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
