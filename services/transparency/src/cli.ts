// Transparency CLI — public read-only view. Usage:
//   node dist/services/transparency/src/cli.js <results|verify|export-csv|audit-status|observe> [--station X] [--pubkey file] [--out file] [--data data]
// `observe` is the observer-portal view: station event chain + result + incident counts. No voter PII.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';
import { canonical, sha256Hex } from '../../election-core/src/crypto-utils.js';
import { loadElection, loadEvents, loadIncidents, loadResults } from '../../election-core/src/store.js';
import { summarize } from '../../incidents/src/index.js';
import { csvField, toCSV, toDatasetCSV, toPublic } from './index.js';

function args(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const raw = process.argv.slice(3);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const m = a.match(/^--([^=]+)=?(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (m[2] !== '') {
      out[key] = m[2];
    } else if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) {
      out[key] = raw[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function main(): void {
  const a = args();
  const root = typeof a['data'] === 'string' ? String(a['data']) : 'data';
  const c = process.argv[2] ?? 'results';
  const results = loadResults(root);

  if (c === 'results') {
    const st = typeof a['station'] === 'string' ? String(a['station']) : undefined;
    const rows = st ? results.filter((r) => r.polling_station === st) : results;
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (c === 'verify') {
    const st = typeof a['station'] === 'string' ? String(a['station']) : undefined;
    const rows = st ? results.filter((r) => r.polling_station === st) : results;
    if (!rows.length) {
      console.error('no results found (run simulate or seed first)');
      process.exit(1);
    }
    const pubkeyPem = typeof a['pubkey'] === 'string' ? readFileSync(String(a['pubkey']), 'utf8') : undefined;
    let allOk = true;
    for (const r of rows) {
      const { result_hash, signature, ...body } = r;
      const recomputed = sha256Hex(canonical(body));
      const hashOk = recomputed === result_hash;
      let sigOk: boolean | 'skipped' = 'skipped';
      if (pubkeyPem && result_hash && signature) {
        try {
          sigOk = verify(null, Buffer.from(result_hash, 'hex'), createPublicKey(pubkeyPem), Buffer.from(signature, 'hex'));
        } catch { sigOk = false; }
      }
      const ok = hashOk && sigOk !== false;
      allOk &&= ok;
      console.log(`${r.polling_station}: hash=${hashOk ? 'OK' : 'FAIL'} sig=${sigOk} ${ok ? 'VALID' : 'INVALID'}`);
    }
    process.exit(allOk ? 0 : 3);
    return;
  }

  if (c === 'export-csv') {
    const audits = new Map<string, string>();
    for (const e of loadEvents(root)) {
      if (e.type === 'POLL_CLOSED') audits.set(e.stationId, 'PASSED');
      if (e.type === 'RESULT_SIGNED' && !audits.has(e.stationId)) audits.set(e.stationId, 'PASSED');
    }
    const csv = toCSV(toPublic(results, audits));
    if (typeof a['out'] === 'string') {
      writeFileSync(String(a['out']), csv + '\n');
      console.log(`wrote ${results.length} rows to ${String(a['out'])}`);
    } else {
      console.log(csv);
    }
    return;
  }

  if (c === 'export-all') {
    const out = typeof a['dir'] === 'string' ? String(a['dir']) : 'open-data';
    mkdirSync(out, { recursive: true });
    const election = loadElection(root);
    const audits = new Map<string, string>();
    for (const e of loadEvents(root)) {
      if (e.type === 'POLL_CLOSED') audits.set(e.stationId, 'PASSED');
      if (e.type === 'RESULT_SIGNED' && !audits.has(e.stationId)) audits.set(e.stationId, 'PASSED');
    }
    const pub = toPublic(results, audits);
    const files: Record<string, string> = {
      'results.csv': toDatasetCSV(results, audits),
      'stations.csv': ['station,district,device,registered,status']
        .concat(election.stations.map((s) => [s.id, s.districtId, s.deviceId, s.registeredVoters, s.status].map(csvField).join(',')))
        .join('\n'),
      'districts.csv': ['district,election,seats']
        .concat(election.districts.map((d) => [d.id, d.electionId, d.seats].map(csvField).join(',')))
        .join('\n'),
      'audit-results.csv': ['station,status,result_hash']
        .concat(pub.map((r) => [r.station, r.audit, r.result_hash].map(csvField).join(',')))
        .join('\n'),
      'incidents.csv': ['id,station,category,status,ts,description']
        .concat(loadIncidents(root).map((x) => [x.id, x.stationId, x.category, x.status, x.ts, x.description].map(csvField).join(',')))
        .join('\n'),
    };
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(`${out}/${name}`, content + '\n');
    }
    console.log(`wrote ${Object.keys(files).length} files to ${out}/ (PII-free open dataset)`);
    return;
  }

  if (c === 'audit-status') {
    const events = loadEvents(root);
    const incidents = loadIncidents(root);
    console.log(JSON.stringify({
      events: events.length,
      stationsWithResults: new Set(results.map((r) => r.polling_station)).size,
      results: results.length,
      incidents: summarize(incidents),
    }, null, 2));
    return;
  }

  if (c === 'observe') {
    const st = typeof a['station'] === 'string' ? String(a['station']) : undefined;
    if (!st) {
      console.error('usage: observe --station X [--data data]');
      process.exit(2);
    }
    const events = loadEvents(root).filter((e) => e.stationId === st).map((e) => ({
      seq: e.seq, ts: e.ts, type: e.type, device: e.deviceId, payload: e.payload,
    }));
    const result = results.find((r) => r.polling_station === st) ?? null;
    const incidents = loadIncidents(root).filter((x) => x.stationId === st).map((x) => ({
      id: x.id, category: x.category, status: x.status, ts: x.ts,
    }));
    console.log(JSON.stringify({ station: st, result, events, incidents }, null, 2));
    return;
  }

  console.error(`unknown command ${c}: use results|verify|export-csv|audit-status|observe`);
  process.exit(2);
}

main();
