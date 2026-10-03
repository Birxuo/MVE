// DR drill — rebuild the national aggregate from station-local signed packages.
// (a) full recovery: all station copies present + hashes verify → rewrites transparency/results.json, exit 0.
// (b) gap detection: any expected station (POLL_CLOSED in audit log) missing or invalid → report + exit 1.
// (c) 3-copy rebuild (§32): --from BACKUP reads the expected list AND the copies
//     from a surviving copy (regional data center / offline archival media) and
//     rebuilds --data NATIONAL from it. Any ONE surviving copy suffices.
// Usage: node dist/research/simulations/recover.js [--data national] [--from backup]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, sha256Hex } from '../../services/election-core/src/crypto-utils.js';
import { ensureDataDirs, loadEvents, saveEvents } from '../../services/election-core/src/store.js';
import type { AuditEvent, ResultPackage } from '../../services/election-core/src/types.js';

function arg(key: string, fallback: string): string {
  const i = process.argv.indexOf(`--${key}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${key}=`));
  return eq ? eq.slice(key.length + 3) : fallback;
}
const ROOT = arg('data', 'data');
const FROM = arg('from', ROOT);

const events = loadEvents(FROM);
const expected = [...new Set(events.filter((e) => e.type === 'POLL_CLOSED').map((e) => e.stationId))].sort();
if (!expected.length) {
  console.error(`no POLL_CLOSED events in ${FROM}/audit/events.json — nothing to recover (wrong --from?)`);
  process.exit(2);
}

const stationsDir = join(FROM, 'stations');
const recovered: ResultPackage[] = [];
const missing: string[] = [];
const invalid: string[] = [];

for (const station of expected) {
  const p = join(stationsDir, station, 'result.json');
  if (!existsSync(p)) {
    missing.push(station);
    continue;
  }
  try {
    const pkg = JSON.parse(readFileSync(p, 'utf8')) as ResultPackage;
    const { result_hash, signature, ...body } = pkg;
    void signature;
    if (pkg.polling_station !== station || sha256Hex(canonical(body)) !== result_hash) {
      invalid.push(station);
      continue;
    }
    recovered.push(pkg);
  } catch {
    invalid.push(station);
  }
}

console.log(`expected stations (POLL_CLOSED in ${FROM}): ${expected.length}`);
console.log(`recovered: ${recovered.length}, missing: ${missing.length}, invalid: ${invalid.length}`);
if (missing.length) console.log(`MISSING: ${missing.join(', ')}`);
if (invalid.length) console.log(`INVALID: ${invalid.join(', ')}`);

if (missing.length || invalid.length) {
  console.log('RECOVERY INCOMPLETE — gap detected, aggregate NOT rewritten');
  process.exit(1);
}

ensureDataDirs(ROOT);
mkdirSync(join(ROOT, 'transparency'), { recursive: true });
recovered.sort((a, b) => a.polling_station.localeCompare(b.polling_station));
writeFileSync(join(ROOT, 'transparency', 'results.json'), JSON.stringify(recovered, null, 2) + '\n');
// Auditable receipt of the rebuild itself (hash-chained, unsigned — same posture
// as TRANSMISSION_RECEIVED: the terminal/DR keys are transport keys, not signers).
{
  const log = loadEvents(ROOT);
  const seq = log.length;
  const ts = new Date().toISOString();
  const prevHash = log.length ? log[log.length - 1].hash : 'GENESIS';
  const receipt: AuditEvent = {
    seq, ts, type: 'RECOVERY_COMPLETED', stationId: 'NATIONAL', deviceId: 'DR',
    payload: { stations: recovered.length, from: FROM },
    prevHash, hash: '',
  };
  receipt.hash = sha256Hex(prevHash + '|' + canonical({
    seq, ts, type: receipt.type, stationId: receipt.stationId,
    deviceId: receipt.deviceId, payload: receipt.payload,
  }));
  log.push(receipt);
  saveEvents(log, ROOT);
}
console.log(`RECOVERED aggregate rewritten (${recovered.length} stations, all hashes verified)`);
console.log(`also present on disk but unclaimed: ${
  existsSync(stationsDir)
    ? readdirSync(stationsDir).filter((d) => !expected.includes(d)).join(', ') || 'none'
    : 'none'
}`);
