// DR drill — rebuild the national aggregate from station-local signed packages.
// (a) full recovery: all station copies present + hashes verify → rewrites transparency/results.json, exit 0.
// (b) gap detection: any expected station (POLL_CLOSED in audit log) missing or invalid → report + exit 1.
// Usage: node dist/research/simulations/recover.js [--data data]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, sha256Hex } from '../../services/election-core/src/crypto-utils.js';
import { ensureDataDirs, loadEvents } from '../../services/election-core/src/store.js';
import type { ResultPackage } from '../../services/election-core/src/types.js';

function arg(key: string, fallback: string): string {
  const i = process.argv.indexOf(`--${key}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${key}=`));
  return eq ? eq.slice(key.length + 3) : fallback;
}
const ROOT = arg('data', 'data');

const events = loadEvents(ROOT);
const expected = [...new Set(events.filter((e) => e.type === 'POLL_CLOSED').map((e) => e.stationId))].sort();

const stationsDir = join(ROOT, 'stations');
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

console.log(`expected stations (POLL_CLOSED): ${expected.length}`);
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
console.log(`RECOVERED aggregate rewritten (${recovered.length} stations, all hashes verified)`);
console.log(`also present on disk but unclaimed: ${
  existsSync(stationsDir)
    ? readdirSync(stationsDir).filter((d) => !expected.includes(d)).join(', ') || 'none'
    : 'none'
}`);
