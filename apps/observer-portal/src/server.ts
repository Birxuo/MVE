// Observer portal — accredited-observer views + evidence-backed reporting.
// GET endpoints are read-only (station events, incidents, results refs).
// POST /api/reports creates an incident (workflow only — never touches results)
// with evidence files (≤1MB total, allowlisted types, sha256-verified) stored
// under data/evidence/<id>/. Binds 127.0.0.1 by default.
// Usage: node dist/apps/observer-portal/src/server.js [--data data] [--port 8081]
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, sha256Hex } from '../../../services/election-core/src/crypto-utils.js';
import {
  DATA_ROOT, ensureDataDirs, loadElection, loadEvents, loadIncidents, saveEvents, saveIncidents,
} from '../../../services/election-core/src/store.js';
import type { AuditEvent } from '../../../services/election-core/src/types.js';
import { createIncident, INCIDENT_CATEGORIES } from '../../../services/incidents/src/index.js';

const MAX_EVIDENCE_BYTES = 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf', 'text/plain']);

function send(res: ServerResponse, code: number, body: unknown, type = 'application/json; charset=utf-8'): void {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': type, 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readJsonBody(req: IncomingMessage, limit = MAX_EVIDENCE_BYTES * 2): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function auditIncident(root: string, stationId: string, id: string, category: string): void {
  const events = loadEvents(root);
  const seq = events.length;
  const ts = new Date().toISOString();
  const prevHash = events.length ? events[events.length - 1].hash : 'GENESIS';
  const hash = sha256Hex(prevHash + '|' + canonical({
    seq, ts, type: 'INCIDENT_REPORTED', stationId, deviceId: 'N/A', payload: { id, category },
  }));
  const ev: AuditEvent = {
    seq, ts, type: 'INCIDENT_REPORTED', stationId, deviceId: 'N/A',
    payload: { id, category }, prevHash, hash,
  };
  events.push(ev);
  saveEvents(events, root);
}

async function handle(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const u = new URL(req.url ?? '/', 'http://localhost');
  const seg = u.pathname.split('/').filter(Boolean);

  if (seg.length === 0) {
    const page = join(process.cwd(), 'apps/observer-portal/index.html');
    if (method === 'GET' && existsSync(page)) {
      const html = readFileSync(page, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
      res.end(html);
      return;
    }
    send(res, 200, { service: 'mve-observer', api: 'v1' });
    return;
  }
  if (seg[0] !== 'api') {
    send(res, 404, { error: 'not found' });
    return;
  }

  if (seg[1] === 'stations') {
    const election = loadElection(root);
    if (method !== 'GET') {
      send(res, 405, { error: 'read-only' });
      return;
    }
    if (seg[2] && seg[3] === 'events') {
      const id = decodeURIComponent(seg[2]);
      if (!election.stations.some((s) => s.id === id)) {
        send(res, 404, { error: 'unknown station' });
        return;
      }
      send(res, 200, loadEvents(root).filter((e) => e.stationId === id).map((e) => ({
        seq: e.seq, ts: e.ts, type: e.type, device: e.deviceId, payload: e.payload,
      })));
      return;
    }
    if (seg[2] && seg[3] === 'incidents') {
      const id = decodeURIComponent(seg[2]);
      send(res, 200, loadIncidents(root).filter((x) => x.stationId === id).map((x) => ({
        id: x.id, category: x.category, status: x.status, ts: x.ts,
      })));
      return;
    }
    send(res, 200, election.stations.map((s) => ({ id: s.id, district: s.districtId, status: s.status, device: s.deviceId })));
    return;
  }

  if (seg[1] === 'reports' && method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch (e) {
      send(res, (e as Error).message === 'body too large' ? 413 : 400, { error: (e as Error).message });
      return;
    }
    const station = String(body.station ?? '');
    const category = String(body.category ?? '');
    const description = String(body.description ?? '');
    const reporter = String(body.reporter ?? 'anonymous').slice(0, 120);
    const election = loadElection(root);
    if (!station || !election.stations.some((s) => s.id === station)) {
      send(res, 400, { error: 'unknown station' });
      return;
    }
    if (!(INCIDENT_CATEGORIES as readonly string[]).includes(category)) {
      send(res, 400, { error: `invalid category (see ${INCIDENT_CATEGORIES.join(',')})` });
      return;
    }
    if (!description.trim() || description.length > 2000) {
      send(res, 400, { error: 'description required (max 2000 chars)' });
      return;
    }
    const evidence = Array.isArray(body.evidence) ? body.evidence as Record<string, unknown>[] : [];
    const refs: string[] = [];
    let total = 0;
    for (const ev of evidence) {
      const name = String(ev.name ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const mime = String(ev.mime ?? '');
      const content = Buffer.from(String(ev.contentBase64 ?? ''), 'base64');
      if (!name || !ALLOWED_MIME.has(mime) || !content.length) {
        send(res, 400, { error: `bad evidence entry ${name || '?'}` });
        return;
      }
      total += content.length;
      if (total > MAX_EVIDENCE_BYTES) {
        send(res, 413, { error: 'evidence exceeds 1MB total' });
        return;
      }
      if (createHash('sha256').update(content).digest('hex') !== String(ev.sha256 ?? '')) {
        send(res, 400, { error: `sha256 mismatch for ${name}` });
        return;
      }
    }
    const list = loadIncidents(root);
    let inc;
    try {
      inc = createIncident(list, { stationId: station, category, description, reporter });
    } catch (e) {
      send(res, 400, { error: (e as Error).message });
      return;
    }
    if (evidence.length) {
      const dir = join(root, 'evidence', inc.id);
      mkdirSync(dir, { recursive: true });
      for (const ev of evidence) {
        const name = String(ev.name ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
        writeFileSync(join(dir, name), Buffer.from(String(ev.contentBase64 ?? ''), 'base64'));
        refs.push(`${inc.id}/${name}`);
      }
      inc.evidenceRefs = refs;
    }
    saveIncidents(list, root);
    auditIncident(root, station, inc.id, category);
    send(res, 201, { id: inc.id, status: inc.status, evidence: refs });
    return;
  }

  send(res, 404, { error: 'not found' });
}

export function startObserverPortal(root: string, port: number, host: string): Server {
  ensureDataDirs(root);
  const server = createServer((req, res) => {
    handle(root, req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    });
  });
  server.listen(port, host);
  return server;
}

function arg(key: string, fallback: string): string {
  const i = process.argv.indexOf(`--${key}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${key}=`));
  return eq ? eq.slice(key.length + 3) : fallback;
}

const isMain = process.argv[1]?.endsWith('server.js') ?? false;
if (isMain) {
  const root = arg('data', DATA_ROOT);
  const port = Number(arg('port', '8081'));
  const host = arg('host', '127.0.0.1');
  startObserverPortal(root, port, host);
  console.log(`mve observer portal on http://${host}:${port} (data=${root})`);
}
