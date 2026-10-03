// Chaos drills — power loss, network partition, DB corruption (FULL_PLAN §§33-35).
// File-level scenarios on throwaway roots. Exit 0 iff all selected detect.
// Usage: node dist/research/simulations/chaos.js [--only power|partition|db-corruption]
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDataDirs, loadBallots, loadResults, saveElection, saveVoters } from '../../services/election-core/src/store.js';
import { castBallot, closeMachine, openMachine } from '../../voting/client/src/machine.js';
import { exportStation, importBundle, terminalInit } from '../../services/transmission/src/index.js';

function parseArgs(raw: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i].match(/^--([^=]+)=?(.*)$/);
    if (!m) continue;
    if (m[2] !== '') out[m[1]] = m[2];
    else if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) out[m[1]] = raw[++i];
    else out[m[1]] = true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const ONLY = typeof args['only'] === 'string' ? String(args['only']) : undefined;
const FW = 'sha256:sim-firmware-v1';

function seed(root: string, station = 'S1', voters = ['V1', 'V2', 'V3', 'V4', 'V5']): void {
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: [{
      id: station, districtId: 'D1', name: station, registeredVoters: voters.length,
      status: 'closed', deviceId: 'M-001', firmwareHash: FW,
    }],
    candidates: [
      { id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' },
      { id: 'party_b', electionId: 'E1', name: 'B', party: 'party_b' },
    ],
    officers: [],
  }, root);
  saveVoters(voters.map((voterId) => ({ voterId, districtId: 'D1', stationId: station, eligible: true, status: 'NOT_VOTED' as const })), root);
}

type Verdict = { name: string; detected: boolean; detail: string };
const verdicts: Verdict[] = [];
function check(name: string, detected: boolean, detail: string): void {
  if (!ONLY || ONLY === name) verdicts.push({ name, detected, detail });
}

// 8a. power-cut — halt mid-day (no close), then resume on restored power.
{
  const root = mkdtempSync(join(tmpdir(), 'mve-chaos-power-'));
  seed(root);
  openMachine(root, 'S1', FW, ['presiding', 'observer']);
  castBallot(root, 'S1', 'V1', 'party_a');
  castBallot(root, 'S1', 'V2', 'party_b');
  // POWER DIES HERE: process would exit. On disk: ballots+slips, no package.
  const deadNoPackage = !existsSync(join(root, 'stations', 'S1', 'result.json'));
  // Power restored: same root, continue voting, close normally.
  castBallot(root, 'S1', 'V3', 'party_a');
  const pkg = closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);
  check('power', deadNoPackage && pkg.ballots_counted === 3,
    `halt left no package (${deadNoPackage}); resume counted ${pkg.ballots_counted}/3`);
}

// 8b. partition — same bundle to two terminals; reconnect replay is refused.
{
  const station = mkdtempSync(join(tmpdir(), 'mve-chaos-part-s-'));
  const natA = mkdtempSync(join(tmpdir(), 'mve-chaos-part-a-'));
  const natB = mkdtempSync(join(tmpdir(), 'mve-chaos-part-b-'));
  seed(station);
  openMachine(station, 'S1', FW, ['presiding', 'observer']);
  castBallot(station, 'S1', 'V1', 'party_a');
  closeMachine(station, 'S1', ['presiding', 'deputy', 'observer']);
  const pubA = terminalInit(natA);
  const pubB = terminalInit(natB);
  const fA = join(station, 'a.mvepkg');
  const fB = join(station, 'b.mvepkg');
  exportStation(station, 'S1', pubA, fA);
  exportStation(station, 'S1', pubB, fB);
  importBundle(natA, fA);
  importBundle(natB, fB);
  let replayRefused = false;
  try {
    importBundle(natA, fA); // reconnect replay — must be refused, not double-counted
  } catch {
    replayRefused = true;
  }
  const hA = loadResults(natA).find((r) => r.polling_station === 'S1')?.result_hash;
  const hB = loadResults(natB).find((r) => r.polling_station === 'S1')?.result_hash;
  check('partition', hA !== undefined && hA === hB && loadResults(natA).length === 1 && replayRefused,
    `terminals converge (${hA?.slice(0, 12)}...), replay refused=${replayRefused}`);
}

// 8c. db-corruption — bit-flipped ballot store is detected, station copies recover.
{
  const root = mkdtempSync(join(tmpdir(), 'mve-chaos-db-'));
  seed(root);
  openMachine(root, 'S1', FW, ['presiding', 'observer']);
  castBallot(root, 'S1', 'V1', 'party_a');
  castBallot(root, 'S1', 'V2', 'party_b');
  closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);
  const bf = join(root, 'voting', 'ballots.json');
  const raw = readFileSync(bf, 'utf8');
  const at = Math.floor(raw.length / 2);
  writeFileSync(bf, raw.slice(0, at) + (raw[at] === 'A' ? 'B' : 'A') + raw.slice(at + 1));
  // Corrupt store no longer matches paper slips (parse fails safe → empty).
  const slips = readdirSync(join(root, 'paper', 'S1')).length;
  const electronic = loadBallots(root).length;
  const detected = electronic !== slips;
  // Station-local signed copy survives for recover.ts-style rebuild.
  const copySurvives = existsSync(join(root, 'stations', 'S1', 'result.json'));
  check('db-corruption', detected && copySurvives,
    `electronic=${electronic} vs paper=${slips} flagged; station copy intact=${copySurvives}`);
}

let failed = 0;
for (const v of verdicts) {
  console.log(`${v.detected ? 'DETECTED' : 'MISSED'} ${v.name}: ${v.detail}`);
  if (!v.detected) failed++;
}
if (!verdicts.length) {
  console.error(`unknown --only ${ONLY} (use power|partition|db-corruption)`);
  process.exit(2);
}
console.log(`${verdicts.length - failed}/${verdicts.length} scenarios detected`);
process.exit(failed ? 1 : 0);
