// Public transparency API server — READ-ONLY, zero deps (node:http).
// Serves docs/architecture/api-spec.yaml from the six file stores.
// Privacy: voter/ballot-detail fields are stripped from every response;
// incidents publish metadata only (no reporter, evidence, or history notes).
// Binds 127.0.0.1 by default. Any non-GET method → 405.
// Usage: node dist/apps/public-portal/src/server.js [--data data] [--port 8080] [--host 127.0.0.1]
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, sha256Hex } from '../../../services/election-core/src/crypto-utils.js';
import { loadElection, loadEvents, loadIncidents, loadResults, loadRevoked } from '../../../services/election-core/src/store.js';
import { isLookupReferenceValid, lookupRegistration } from '../../../services/eligibility/src/lookup.js';
import { toPublic } from '../../../services/transparency/src/index.js';

const STRIP_KEYS = [/voterid/i, /tokenhash/i, /\bcin\b/i, /private/i, /voter_id/i];

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRIP_KEYS.some((re) => re.test(k))) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

function auditStatuses(root: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of loadEvents(root)) {
    if (e.type === 'POLL_CLOSED') m.set(e.stationId, 'PASSED');
    if (e.type === 'RESULT_EXCEPTION') m.set(e.stationId, 'ESCALATED');
  }
  return m;
}

function send(res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload), ...headers });
  res.end(payload);
}

/**
 * Lookup abuse throttle: the reference oracle inherently answers
 * registered-or-not, so enumeration is throttled per client IP (sliding
 * window; 429 + Retry-After past the budget). Lookup-only — published
 * results stay freely browsable. Test hook: resetLookupThrottle().
 */
export const LOOKUP_LIMIT = 30;
export const LOOKUP_WINDOW_MS = 60_000;
const lookupHits = new Map<string, number[]>();

export function resetLookupThrottle(): void {
  lookupHits.clear();
}

function lookupAllowed(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (lookupHits.get(ip) ?? []).filter((t) => now - t < LOOKUP_WINDOW_MS);
  if (hits.length >= LOOKUP_LIMIT) {
    const oldest = Math.min(...hits);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((LOOKUP_WINDOW_MS - (now - oldest)) / 1000)) };
  }
  hits.push(now);
  lookupHits.set(ip, hits);
  return { ok: true, retryAfter: 0 };
}

function route(root: string, method: string, url: string): { code: number; body: unknown } {
  if (method !== 'GET') return { code: 405, body: { error: 'read-only API: use GET' } };
  const u = new URL(url, 'http://localhost');
  const seg = u.pathname.split('/').filter(Boolean);

  if (seg.length === 0) {
    return { code: 200, body: { service: 'mve-transparency', api: 'v1', endpoints: ['elections', 'districts', 'polling-stations', 'results', 'audits', 'incidents', 'verification', 'revoked'] } };
  }
  if (seg[0] !== 'api') return { code: 404, body: { error: 'not found' } };
  const election = loadElection(root);

  // Opt-in pagination: ?limit=N (1..1000) & ?offset=M. Without params the
  // endpoint returns the legacy bare array (static pages rely on it); with
  // params it returns {total, limit, offset, rows}.
  const rawLimit = u.searchParams.get('limit');
  let limit: number | null = null;
  let offset = 0;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    offset = Number(u.searchParams.get('offset') ?? '0');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0) {
      return { code: 400, body: { error: 'bad pagination (want ?limit=1..1000&offset>=0)' } };
    }
  }
  const page = <T>(rows: T[]): T[] | { total: number; limit: number; offset: number; rows: T[] } =>
    limit === null ? rows : { total: rows.length, limit, offset, rows: rows.slice(offset, offset + limit) };

  switch (seg[1]) {
    case 'elections': {
      if (seg[2]) {
        const found = election.elections.find((e) => e.id === decodeURIComponent(seg[2]));
        return found ? { code: 200, body: found } : { code: 404, body: { error: 'unknown election' } };
      }
      return { code: 200, body: election.elections };
    }
    case 'districts':
      return { code: 200, body: election.districts };
    case 'polling-stations': {
      const q = u.searchParams.get('district');
      const rows = q ? election.stations.filter((s) => s.districtId === q) : election.stations;
      return { code: 200, body: page(rows) };
    }
    case 'results': {
      const rows = toPublic(loadResults(root), auditStatuses(root));
      const q = u.searchParams.get('station');
      return { code: 200, body: page(q ? rows.filter((r) => r.station === q) : rows) };
    }
    case 'audits': {
      const statuses = auditStatuses(root);
      const revoked = new Set(loadRevoked(root).map((x) => x.stationId));
      const rows = election.stations.map((s) => ({
        station: s.id, status: statuses.get(s.id) ?? 'PENDING', device: s.deviceId,
        revoked: revoked.has(s.id),
      }));
      const q = u.searchParams.get('station');
      return { code: 200, body: page(q ? rows.filter((r) => r.station === q) : rows) };
    }
    case 'incidents':
      return {
        code: 200,
        body: page(loadIncidents(root).map((x) => ({
          id: x.id, station: x.stationId, category: x.category,
          status: x.status, ts: x.ts, description: x.description,
          accredited: x.accredited ?? false,
        }))),
      };
    case 'revoked':
      // Mirrors revoked.csv from the open dataset: compromised devices that
      // verify paths treat as INVALID. No keys or sensitive material here.
      return {
        code: 200,
        body: page(loadRevoked(root).map((x) => ({
          device: x.deviceId, station: x.stationId, reason: x.reason,
          ts: x.ts, revokedBy: x.revokedBy,
        }))),
      };
    case 'verification': {
      const q = u.searchParams.get('station');
      const rows = q ? loadResults(root).filter((r) => r.polling_station === q) : loadResults(root);
      if (!rows.length) return { code: 404, body: { error: 'no results found' } };
      const revoked = new Set(loadRevoked(root).map((x) => x.stationId));
      return {
        code: 200,
        body: page(rows.map((r) => {
          const { result_hash, signature, ...body } = r;
          void signature;
          const recomputed = sha256Hex(canonical(body));
          const hashOk = recomputed === result_hash;
          const isRevoked = revoked.has(r.polling_station);
          return {
            station: r.polling_station, result_hash, hashOk,
            revoked: isRevoked, valid: hashOk && !isRevoked,
          };
        })),
      };
    }
    case 'lookup': {
      // Citizen self-check: registration + polling station. Returns district,
      // station, and eligibility ONLY — never choices, tokens, or other voters.
      // Prototype uses the local registration-card reference as lookup (never
      // the CIN); production needs rate-limited, privacy-reviewed identification
      // (see docs/elections/citizen-intake.md).
      const ref = u.searchParams.get('reference');
      if (!ref) return { code: 400, body: { error: 'missing ?reference=' } };
      if (!isLookupReferenceValid(ref)) return { code: 400, body: { error: 'bad reference format' } };
      const found = lookupRegistration(root, ref);
      if (!found) return { code: 404, body: { error: 'not registered' } };
      return { code: 200, body: found };
    }
    default:
      return { code: 404, body: { error: 'not found' } };
  }
}

export function startServer(root: string, port: number, host: string): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      for (const page of ['/', '/index.html', '/citizen', '/citizen.html']) {
        if ((req.method ?? 'GET') === 'GET' && pathname === page) {
          const file = join(process.cwd(), 'apps/public-portal',
            page === '/' || page === '/index.html' ? 'index.html' : 'citizen.html');
          if (existsSync(file)) {
            const html = readFileSync(file, 'utf8');
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
            res.end(html);
            return;
          }
        }
      }
      // Throttle the registration oracle before routing (applies to /api/lookup).
      if (pathname === '/api/lookup') {
        const ip = req.socket.remoteAddress ?? 'unknown';
        const gate = lookupAllowed(ip);
        if (!gate.ok) {
          send(res, 429, { error: 'too many lookups — wait and retry' }, { 'retry-after': String(gate.retryAfter) });
          return;
        }
      }
      const { code, body } = route(root, req.method ?? 'GET', req.url ?? '/');
      send(res, code, sanitize(body));
    } catch {
      send(res, 500, { error: 'internal error' });
    }
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
  const root = arg('data', 'data');
  const port = Number(arg('port', '8080'));
  const host = arg('host', '127.0.0.1');
  startServer(root, port, host);
  console.log(`mve transparency API on http://${host}:${port} (read-only, data=${root})`);
}
