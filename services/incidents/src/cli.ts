// Incidents CLI — report / triage / resolve / reopen / list.
// Workflow only: reports never modify results. Transitions are audit-logged.
// Usage: node dist/services/incidents/src/cli.js <cmd> [--station X] [--id INC-0001] ...
import { canonical, sha256Hex } from '../../election-core/src/crypto-utils.js';
import {
  DATA_ROOT, ensureDataDirs, loadElection, loadEvents, loadIncidents, saveEvents, saveIncidents,
} from '../../election-core/src/store.js';
import type { AuditEvent } from '../../election-core/src/types.js';
import {
  createIncident, reopenIncident, resolveIncident, summarize, triageIncident,
} from './index.js';

function args(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const raw = process.argv.slice(3);
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i].match(/^--([^=]+)=?(.*)$/);
    if (!m) continue;
    if (m[2] !== '') out[m[1]] = m[2];
    else if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) out[m[1]] = raw[++i];
    else out[m[1]] = true;
  }
  return out;
}

function str(a: Record<string, string | true>, k: string, fallback = ''): string {
  const v = a[k];
  return v === undefined || v === true ? fallback : String(v);
}

function deviceFor(stationId: string, root: string): string {
  const s = loadElection(root);
  return s.stations.find((x) => x.id === stationId)?.deviceId ?? 'N/A';
}

function audit(type: string, stationId: string, deviceId: string, payload: Record<string, unknown>, root: string): void {
  const events = loadEvents(root);
  const seq = events.length;
  const ts = new Date().toISOString();
  const prevHash = events.length ? events[events.length - 1].hash : 'GENESIS';
  const hash = sha256Hex(prevHash + '|' + canonical({ seq, ts, type, stationId, deviceId, payload }));
  const ev: AuditEvent = { seq, ts, type, stationId, deviceId, payload, prevHash, hash };
  events.push(ev);
  saveEvents(events, root);
}

function main(): void {
  const a = args();
  const root = str(a, 'data', DATA_ROOT) || DATA_ROOT;
  ensureDataDirs(root);
  const c = process.argv[2] ?? 'list';

  if (c === 'report') {
    const station = str(a, 'station');
    const category = str(a, 'category');
    const description = str(a, 'description');
    if (!station || !category || !description) {
      console.error('usage: report --station X --category <cat> --description "..." [--reporter Y] [--evidence a,b]');
      process.exit(2);
    }
    const list = loadIncidents(root);
    const inc = createIncident(list, {
      stationId: station, category, description,
      reporter: str(a, 'reporter', 'anonymous') || 'anonymous',
      evidenceRefs: str(a, 'evidence').split(',').map((x) => x.trim()).filter(Boolean),
    });
    saveIncidents(list, root);
    audit('INCIDENT_REPORTED', station, deviceFor(station, root), { id: inc.id, category }, root);
    console.log(`${inc.id} reported at ${station} [${inc.category}]`);
    return;
  }

  if (c === 'triage' || c === 'resolve' || c === 'reopen') {
    const id = str(a, 'id');
    const note = str(a, 'note');
    if (!id || !note) {
      console.error(`usage: ${c} --id INC-0001 --note "..." [--decision investigating|dismissed for triage]`);
      process.exit(2);
    }
    const list = loadIncidents(root);
    const inc = c === 'triage'
      ? triageIncident(list, id, (str(a, 'decision', 'investigating') === 'dismissed' ? 'dismissed' : 'investigating'), note)
      : c === 'resolve' ? resolveIncident(list, id, note) : reopenIncident(list, id, note);
    saveIncidents(list, root);
    audit(
      c === 'triage' ? 'INCIDENT_TRIAGED' : c === 'resolve' ? 'INCIDENT_RESOLVED' : 'INCIDENT_REOPENED',
      inc.stationId, deviceFor(inc.stationId, root), { id: inc.id, status: inc.status }, root,
    );
    console.log(`${inc.id} → ${inc.status}`);
    return;
  }

  if (c === 'list') {
    const list = loadIncidents(root);
    const station = str(a, 'station');
    const status = str(a, 'status');
    const rows = list.filter((x) => (!station || x.stationId === station) && (!status || x.status === status));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (c === 'summary') {
    console.log(JSON.stringify(summarize(loadIncidents(root)), null, 2));
    return;
  }

  console.error(`unknown command ${c}: use report|triage|resolve|reopen|list|summary`);
  process.exit(2);
}

main();
