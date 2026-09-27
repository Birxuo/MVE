// Physical audit — recount paper slips vs electronic ballots vs published results.
// Per-station report: {station, paper, electronic, published, paperTally, status}.
// Slip-level diff for RLA-sampled stations (--sample N --seed S).
// Read-only: never modifies stores. Exit 0 all-match, 3 on any mismatch.
// Usage: node dist/voting/verification/check.js [--station X] [--sample N] [--seed S] [--data data]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_ROOT, loadBallots, loadElection, loadResults } from '../../../services/election-core/src/store.js';
import { sampleStations, seedFromCeremony } from '../../../services/audit/src/index.js';
import type { Ballot, ResultPackage } from '../../../services/election-core/src/types.js';
import type { PaperSlip } from '../../client/src/machine.js';

function arg(key: string, fallback: string): string {
  const i = process.argv.indexOf(`--${key}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${key}=`));
  return eq ? eq.slice(key.length + 3) : fallback;
}
const ROOT = arg('data', DATA_ROOT);
const ONLY = arg('station', '');
const SAMPLE_N = Number(arg('sample', '0'));
const SEED_ARG = arg('seed', '20260923');
const CEREMONY = arg('ceremony', '');
const SEED = CEREMONY ? seedFromCeremony(CEREMONY) : Number(SEED_ARG);

function readSlips(root: string, stationId: string): PaperSlip[] {
  const dir = join(root, 'paper', stationId);
  if (!existsSync(dir)) return [];
  const out: PaperSlip[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as PaperSlip;
      if (s.stationId === stationId) out.push(s);
    } catch {
      // unreadable slip counts as a physical-audit finding, surfaced via count gap
    }
  }
  return out;
}

function tallyChoices(items: { choiceId: string }[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const x of items) t[x.choiceId] = (t[x.choiceId] ?? 0) + 1;
  return t;
}

/** Order-insensitive tally equality (insertion order differs between streams). */
function talliesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

const election = loadElection(ROOT);
const ballots = loadBallots(ROOT);
const published = loadResults(ROOT);
const stations = (ONLY ? election.stations.filter((s) => s.id === ONLY) : election.stations).map((s) => s.id);
if (ONLY && !stations.length) {
  console.error(`unknown station ${ONLY}`);
  process.exit(2);
}
const sampled = SAMPLE_N > 0 ? new Set(sampleStations(stations, SAMPLE_N, SEED)) : null;

let bad = 0;
for (const station of stations) {
  const slips = readSlips(ROOT, station);
  const eBallots: Ballot[] = ballots.filter((b: Ballot) => b.stationId === station);
  const pub: ResultPackage | undefined = published.find((r: ResultPackage) => r.polling_station === station);
  const paperTally = tallyChoices(slips);
  const eTally = tallyChoices(eBallots);
  const talliesMatch = talliesEqual(paperTally, eTally);
  const publishedMatch = pub ? pub.ballots_counted === eBallots.length : eBallots.length === 0;
  // Slip-level diff only where the RLA sample demands manual inspection.
  let slipDiff: string[] = [];
  if (sampled && sampled.has(station)) {
    const eIds = new Set(eBallots.map((b: Ballot) => b.ballotId));
    slipDiff = slips.filter((s) => !eIds.has(s.slipId)).map((s) => `paper-only:${s.slipId}`);
    const sIds = new Set(slips.map((s) => s.slipId));
    slipDiff.push(...eBallots.filter((b: Ballot) => !sIds.has(b.ballotId)).map((b: Ballot) => `electronic-only:${b.ballotId}`));
  }
  const ok = slips.length === eBallots.length && talliesMatch && publishedMatch && slipDiff.length === 0;
  if (!ok) bad++;
  console.log(JSON.stringify({
    station, paper: slips.length, electronic: eBallots.length, published: pub?.ballots_counted ?? 0,
    paperTally, status: ok ? 'MATCH' : 'MISMATCH',
    ...(sampled?.has(station) ? { rlaSampled: true, slipDiff } : {}),
  }));
}
console.log(bad ? `MISMATCH at ${bad} station(s)` : `all ${stations.length} station(s) MATCH`);
process.exit(bad ? 3 : 0);
