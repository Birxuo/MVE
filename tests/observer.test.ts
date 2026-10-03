import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startObserverPortal } from '../apps/observer-portal/src/server.js';
import {
  ensureDataDirs, loadElection, loadEvents, loadIncidents, saveElection, saveEvents, saveVoters,
} from '../services/election-core/src/store.js';

let server: Server;
let base: string;
let root: string;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'mve-obs-'));
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: [{ id: 'S1', districtId: 'D1', name: 'S1', registeredVoters: 5, status: 'open', deviceId: 'M-001', firmwareHash: 'sha256:x' }],
    candidates: [],
    officers: [],
  }, root);
  saveVoters([], root);
  saveEvents([{
    seq: 0, ts: '2026-09-23T08:00:00Z', type: 'POLL_OPENED', stationId: 'S1',
    deviceId: 'M-001', payload: {}, prevHash: 'GENESIS', hash: 'abc',
  }], root);
  server = startObserverPortal(root, 0, '127.0.0.1');
  return new Promise<void>((resolve) => {
    server.on('listening', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function call(path: string, opts?: RequestInit): Promise<{ status: number; body: string }> {
  const r = await fetch(base + path, opts);
  return { status: r.status, body: await r.text() };
}

describe('observer portal', () => {
  it('serves stations, events, incidents; 404s unknown stations', async () => {
    assert.equal((await call('/api/stations')).status, 200);
    const ev = await call('/api/stations/S1/events');
    assert.equal(ev.status, 200);
    assert.match(ev.body, /POLL_OPENED/);
    assert.equal((await call('/api/stations/NOPE/events')).status, 404);
    assert.equal((await call('/api/stations/S1/incidents')).status, 200);
  });

  it('files evidence-backed reports; rejects bad input', async () => {
    const content = Buffer.from('photo-bytes').toString('base64');
    const sha = createHash('sha256').update(Buffer.from('photo-bytes')).digest('hex');
    const good = await call('/api/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        station: 'S1', category: 'ballot-issue', description: 'seal torn',
        reporter: 'observer:7',
        evidence: [{ name: 'seal.png', mime: 'image/png', sha256: sha, contentBase64: content }],
      }),
    });
    assert.equal(good.status, 201);
    const id = JSON.parse(good.body).id as string;
    assert.match(id, /^INC-/);
    // Persisted: case file carries the evidence ref, audit log carries the receipt.
    const stored = loadIncidents(root).find((x) => x.id === id);
    assert.ok(stored);
    assert.deepEqual(stored.evidenceRefs, [`${id}/seal.png`]);
    assert.ok(loadEvents(root).some((e) => e.type === 'INCIDENT_REPORTED'
      && (e.payload as Record<string, unknown>).id === id));
  });

  it('rejects invalid category, unknown station, sha mismatch, oversize', async () => {
    const post = (b: unknown): Promise<{ status: number; body: string }> => call('/api/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
    });
    assert.equal((await post({ station: 'S1', category: 'ufo', description: 'x' })).status, 400);
    assert.equal((await post({ station: 'NOPE', category: 'other', description: 'x' })).status, 400);
    assert.equal((await post({
      station: 'S1', category: 'other', description: 'x',
      evidence: [{ name: 'a.png', mime: 'image/png', sha256: '00'.repeat(32), contentBase64: Buffer.from('zz').toString('base64') }],
    })).status, 400);
    const big = Buffer.alloc(1024 * 1024 + 1, 7).toString('base64');
    const bigSha = createHash('sha256').update(Buffer.alloc(1024 * 1024 + 1, 7)).digest('hex');
    assert.equal((await post({
      station: 'S1', category: 'other', description: 'x',
      evidence: [{ name: 'big.png', mime: 'image/png', sha256: bigSha, contentBase64: big }],
    })).status, 413);
  });

  it('flags accreditation: registered station observer → ACCREDITED, others → UNVERIFIED', async () => {
    const post = (b: unknown): Promise<{ status: number; body: string }> => call('/api/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
    });
    const election = loadElection(root);
    election.officers.push({ id: 'OBS-7', stationId: 'S1', role: 'observer' });
    election.officers.push({ id: 'PRES-1', stationId: 'S1', role: 'presiding' });
    saveElection(election, root);

    const good = await post({ station: 'S1', category: 'other', description: 'accredited report', observerId: 'OBS-7' });
    assert.equal(good.status, 201);
    assert.deepEqual(JSON.parse(good.body).verification, 'ACCREDITED');
    const stored = loadIncidents(root).find((x) => x.id === JSON.parse(good.body).id);
    assert.equal(stored?.accredited, true);
    assert.equal(stored?.observerId, 'OBS-7');

    // Unauthenticated posts still work — flagged, never dropped.
    const anon = await post({ station: 'S1', category: 'other', description: 'anon report' });
    assert.equal(anon.status, 201);
    assert.deepEqual(JSON.parse(anon.body).verification, 'UNVERIFIED');

    // Wrong role and unknown id fail closed to UNVERIFIED.
    for (const observerId of ['PRES-1', 'GHOST']) {
      const r = await post({ station: 'S1', category: 'other', description: 'x', observerId });
      assert.equal(r.status, 201);
      assert.deepEqual(JSON.parse(r.body).verification, 'UNVERIFIED', observerId);
    }
    // Other-station observer: registered at S9, reporting at S1 → UNVERIFIED.
    const e2 = loadElection(root);
    e2.officers.push({ id: 'OBS-9', stationId: 'S9', role: 'observer' });
    saveElection(e2, root);
    const cross = await post({ station: 'S1', category: 'other', description: 'cross', observerId: 'OBS-9' });
    assert.equal(JSON.parse(cross.body).verification, 'UNVERIFIED');
  });

  it('scans text evidence for identifiers; binaries pass as unscanned', async () => {
    const post = (b: unknown): Promise<{ status: number; body: string }> => call('/api/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
    });
    const ev = (name: string, mime: string, raw: string): Record<string, string> => ({
      name, mime,
      sha256: createHash('sha256').update(Buffer.from(raw)).digest('hex'),
      contentBase64: Buffer.from(raw).toString('base64'),
    });
    const dirty = await post({
      station: 'S1', category: 'other', description: 'dirty notes',
      evidence: [ev('notes.txt', 'text/plain', 'witness with CIN AB123456 refused')],
    });
    assert.equal(dirty.status, 400);
    assert.match(dirty.body, /redaction/);
    const clean = await post({
      station: 'S1', category: 'other', description: 'clean notes',
      evidence: [ev('notes.txt', 'text/plain', 'seal intact at 19:05, four observers present')],
    });
    assert.equal(clean.status, 201);
    assert.deepEqual(JSON.parse(clean.body).redaction, { scanned: ['notes.txt'], unscanned: [] });
    const mixed = await post({
      station: 'S1', category: 'other', description: 'mixed',
      evidence: [ev('notes.txt', 'text/plain', 'all quiet'), ev('photo.png', 'image/png', 'photo-bytes')],
    });
    assert.equal(mixed.status, 201);
    assert.deepEqual(JSON.parse(mixed.body).redaction, { scanned: ['notes.txt'], unscanned: ['photo.png'] });
  });
});
