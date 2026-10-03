// Portal API tests — endpoint matrix, GET-only enforcement, no-PII response scans.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { startServer } from '../apps/public-portal/src/server.js';
import { LOOKUP_LIMIT, resetLookupThrottle } from '../apps/public-portal/src/server.js';
import {
  ensureDataDirs, saveElection, saveEvents, saveIncidents, saveResults, saveRevoked, saveVoters,
} from '../services/election-core/src/store.js';
import { generateDeviceKeys, signResult } from '../services/results/src/index.js';
import { createIncident } from '../services/incidents/src/index.js';
import type { Server } from 'node:http';

let server: Server;
let base: string;
let root: string;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'mve-portal-'));
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'closed' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: [{
      id: 'S1', districtId: 'D1', name: 'S1', registeredVoters: 10,
      status: 'closed', deviceId: 'M-001', firmwareHash: 'sha256:x',
    }],
    candidates: [{ id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' }],
    officers: [],
  }, root);
  const keys = generateDeviceKeys('M-001');
  saveResults([signResult({
    election: 'E1', polling_station: 'S1', device: 'M-001',
    ballots_issued: 5, ballots_counted: 5, invalid_ballots: 0,
    results: { party_a: 5 }, timestamp: '2026-09-23T19:05:00Z', firmware_hash: 'sha256:x',
  }, keys.privateKeyPem)], root);
  saveEvents([{
    seq: 0, ts: '2026-09-23T19:00:00Z', type: 'POLL_CLOSED', stationId: 'S1',
    deviceId: 'M-001', payload: {}, prevHash: 'GENESIS', hash: 'abc',
  }], root);
  const incidents: Parameters<typeof saveIncidents>[0] = [];
  createIncident(incidents, {
    stationId: 'S1', category: 'other', description: 'test, with "quotes"', reporter: 'observer:9',
  });
  saveIncidents(incidents, root);
  saveRevoked([{
    deviceId: 'M-007', stationId: 'S9', reason: 'lost seal',
    ts: '2026-09-23T00:00:00Z', revokedBy: 'sec',
  }], root);
  server = startServer(root, 0, '127.0.0.1');
  return new Promise<void>((resolve) => {
    server.on('listening', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function get(path: string): Promise<{ status: number; body: string; headers: Headers }> {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.text(), headers: r.headers };
}

describe('portal: endpoint matrix', () => {
  it('serves elections, districts, stations, results, audits, incidents, verification', async () => {
    for (const p of ['/api/elections', '/api/districts', '/api/polling-stations', '/api/results', '/api/audits', '/api/incidents', '/api/verification?station=S1']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.ok(r.body.length > 2, p);
      assert.equal(r.headers.get('x-api-version'), 'v1', p);
      assert.match(r.headers.get('cache-control') ?? '', /no-store/, p);
    }
    const res = JSON.parse((await get('/api/results?station=S1')).body);
    assert.equal(res[0].station, 'S1');
    assert.equal(res[0].audit, 'PASSED');
    const v = JSON.parse((await get('/api/verification?station=S1')).body);
    assert.equal(v[0].hashOk, true);
  });

  it('paginates lists on ?limit&offset; bare arrays stay the default', async () => {
    const all = JSON.parse((await get('/api/results')).body);
    assert.ok(Array.isArray(all));
    const p1 = JSON.parse((await get('/api/results?limit=1&offset=0')).body);
    assert.deepEqual(Object.keys(p1).sort(), ['limit', 'offset', 'rows', 'total']);
    assert.equal(p1.total, all.length);
    assert.equal(p1.rows.length, 1);
    const empty = JSON.parse((await get('/api/results?limit=10&offset=99')).body);
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.total, all.length);
    assert.equal((await get('/api/results?limit=0')).status, 400);
    assert.equal((await get('/api/results?limit=1001')).status, 400);
    const inc = JSON.parse((await get('/api/incidents?limit=1')).body);
    assert.equal(inc.total, 1);
  });

  it('exposes revocations via /api/revoked and flags them on audits', async () => {
    const rev = JSON.parse((await get('/api/revoked')).body);
    assert.ok(Array.isArray(rev));
    assert.equal(rev[0].device, 'M-007');
    assert.equal(rev[0].station, 'S9');
    assert.doesNotMatch(JSON.stringify(rev), /private|pub\.pem/i);
    const audits = JSON.parse((await get('/api/audits')).body);
    assert.equal(audits[0].revoked, false);
  });

  it('404s unknown routes and elections', async () => {
    assert.equal((await get('/nope')).status, 404);
    assert.equal((await get('/api/elections/NOPE')).status, 404);
    assert.equal((await get('/api/verification?station=NOPE')).status, 404);
  });

  it('rejects non-GET with 405', async () => {
    const r = await fetch(base + '/api/results', { method: 'POST' });
    assert.equal(r.status, 405);
    const d = await fetch(base + '/api/results', { method: 'DELETE' });
    assert.equal(d.status, 405);
  });

  it('responses carry no voter, ballot-detail, or reporter data', async () => {
    const bodies = await Promise.all(
      ['/api/results', '/api/audits', '/api/incidents', '/api/verification', '/api/polling-stations', '/api/revoked']
        .map((p) => get(p).then((r) => r.body)),
    );
    for (const b of bodies) {
      assert.doesNotMatch(b, /voterid|tokenhash|voter_id|\bcin\b/i);
    }
    const inc = await get('/api/incidents');
    assert.doesNotMatch(inc.body, /reporter|evidenceRefs|history/);
  });

  it('serves the static homepage as HTML', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/html/);
    assert.match(r.body, /Public Transparency/);
    assert.match(r.body, /<caption>/);
    assert.match(r.body, /scope="col"/);
    assert.match(r.body, /id="contrastToggle"/);
    assert.match(r.body, /aria-live="polite"/);
  });

  it('citizen lookup returns district/station/eligibility only', async () => {
    saveVoters([{ voterId: 'CIT-1', districtId: 'D1', stationId: 'S1', eligible: true, status: 'NOT_VOTED' }], root);
    const ok = await get('/api/lookup?reference=CIT-1');
    assert.equal(ok.status, 200);
    const body = JSON.parse(ok.body);
    assert.deepEqual(body, {
      registered: true, district: 'D1', station: 'S1', stationName: 'S1', eligible: true,
    });
    assert.doesNotMatch(ok.body, /voterId|party_a|token/i);
    assert.equal((await get('/api/lookup?reference=GHOST')).status, 404);
    assert.equal((await get('/api/lookup')).status, 400);
  });

  it('lookup rejects malformed references; CIN-shaped input finds nothing', async () => {
    assert.equal((await get('/api/lookup?reference=' + encodeURIComponent('../../etc'))).status, 400);
    assert.equal((await get('/api/lookup?reference=' + 'x'.repeat(200))).status, 400);
    assert.equal((await get('/api/lookup?reference=AB123456')).status, 404);
  });

  it('lookup throttles enumeration with 429 + Retry-After', async () => {
    resetLookupThrottle();
    for (let i = 0; i < LOOKUP_LIMIT; i++) {
      const r = await get('/api/lookup?reference=GHOST');
      assert.equal(r.status, 404);
    }
    const over = await get('/api/lookup?reference=GHOST');
    assert.equal(over.status, 429);
    assert.match(over.body, /too many lookups/);
    assert.ok(Number(over.headers.get('retry-after')) > 0);
    resetLookupThrottle();
    assert.equal((await get('/api/lookup?reference=GHOST')).status, 404);
  });

  it('serves the citizen page as HTML', async () => {
    const r = await get('/citizen');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/html/);
    assert.match(r.body, /Check my registration/);
    assert.match(r.body, /id="contrastToggle"/);
    assert.match(r.body, /aria-live="polite"/);
    assert.match(r.body, /never enter your CIN/);
  });
});
