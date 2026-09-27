// Tangier pilot simulator — offline-first, multi-sig open/close, paper+electronic reconcile.
import { EligibilityService } from '../../services/eligibility/src/index.js';
import { BallotService } from '../../services/ballot/src/index.js';
import { generateDeviceKeys, signResult, tally } from '../../services/results/src/index.js';
import { AuditLog, analyzeTelemetry, reconcile, sampleStations } from '../../services/audit/src/index.js';
import { toPublic, toCSV } from '../../services/transparency/src/index.js';
import { participationReceipt } from '../../services/election-core/src/crypto-utils.js';
import { ensureDataDirs, loadIncidents, saveBallots, saveElection, saveEvents, saveIncidents, saveResults, saveVoters } from '../../services/election-core/src/store.js';
import { incidentsFromFlags } from '../../services/incidents/src/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResultPackage, Voter } from '../../services/election-core/src/types.js';

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
const N_STATIONS = Number(args['stations'] ?? 10);
const VOTERS_PER = Number(args['voters'] ?? 50);
const SEED = Number(args['seed'] ?? 42);
const DATA_ROOT = String(args['data'] ?? 'data');
const OUT_CSV = typeof args['out'] === 'string' ? String(args['out']) : undefined;
const WITH_PAPER = args['paper'] === true || String(args['paper'] ?? '') === '1';
const CANDIDATES = ['party_a', 'party_b', 'party_c'];

const eligibility = new EligibilityService();
const ballots = new BallotService(eligibility);
const audit = new AuditLog();
const validChoices = new Set(CANDIDATES);

const stationIds: string[] = [];
const resultPkgs: ResultPackage[] = [];
const audits = new Map<string, string>();
const devicePubkeys = new Map<string, string>();
const stationDevices = new Map<string, string>();
const simVoters: Voter[] = [];

// Deterministic pseudo-random for reproducibility
let seed = SEED;
const rand = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

for (let s = 0; s < N_STATIONS; s++) {
  const stationId = `TANGER-ASilah-${String(s + 1).padStart(4, '0')}`;
  const deviceId = `M-${String(s + 1).padStart(3, '0')}`;
  stationIds.push(stationId);
  const keys = generateDeviceKeys(deviceId);
  const firmwareHash = 'sha256:sim-firmware-v1';

  // Multi-sig open (2 approvals simulated)
  audit.append('POLL_OPENED', stationId, deviceId, { approvals: ['presiding', 'observer'], firmwareHash });

  // Register + vote
  let issued = 0;
  const receipts: string[] = [];
  for (let v = 0; v < VOTERS_PER; v++) {
    const voterId = `${stationId}-V${v}`;
    eligibility.register({ voterId, districtId: 'TANGER-ASILAH', stationId, eligible: true, status: 'NOT_VOTED' });
    // ~90% turnout
    if (rand() < 0.9) {
      const { token } = eligibility.authorize(voterId);
      issued++;
      const choice = CANDIDATES[Math.floor(rand() * CANDIDATES.length)];
      const b = ballots.cast(token, stationId, choice, validChoices);
      receipts.push(participationReceipt(b.ballotId));
      if (v === 0) audit.append('BALLOT_CAST', stationId, deviceId, { sampleBallot: b.ballotId });
      simVoters.push({ voterId, districtId: 'TANGER-ASILAH', stationId, eligible: true, status: 'VOTED' });
    } else {
      simVoters.push({ voterId, districtId: 'TANGER-ASILAH', stationId, eligible: true, status: 'NOT_VOTED' });
    }
  }

  const stationBallots = ballots.forStation(stationId);
  const { results, counted } = tally(stationBallots);
  // Paper matches electronic in honest run
  const rec = reconcile({ authorized: issued, electronic: counted, paper: counted });
  const pkg = signResult({
    election: '2026-L-SIM', polling_station: stationId, device: deviceId,
    ballots_issued: issued, ballots_counted: counted, invalid_ballots: 0,
    results, timestamp: new Date().toISOString(), firmware_hash: firmwareHash,
  }, keys.privateKeyPem);
  // Re-verify immediately (device self-check)
  resultPkgs.push(pkg);
  devicePubkeys.set(stationId, keys.publicKeyPem);
  stationDevices.set(stationId, deviceId);
  audit.append('POLL_CLOSED', stationId, deviceId, { approvals: ['presiding', 'deputy', 'observer'], reconcile: rec.detail });
  audit.append('RESULT_SIGNED', stationId, deviceId, { result_hash: pkg.result_hash });
  audits.set(stationId, rec.ok ? 'PASSED' : 'ESCALATED');
}

// RLA: sample 20% (min 2)
const sampled = sampleStations(stationIds, Math.max(2, Math.ceil(N_STATIONS * 0.2)));
console.log(`Simulated ${N_STATIONS} stations, ${VOTERS_PER} voters each (90% turnout model)`);
console.log(`RLA sample (${sampled.length}): ${sampled.join(', ')}`);

// Multi-signal anomaly analysis for HUMAN review — never auto-fraud.
// --anomalies injects one 99% turnout station; telemetry otherwise comes from
// the audit log itself (open durations, result delays, exceptions, reopens)
// plus recount status (ESCALATED stations).
const INJECT = args['anomalies'] === true || String(args['anomalies'] ?? '') === '1';
const events = audit.all();
const tsOf = (type: string, id: string, nth = 0): number => {
  const hits = events.filter((e) => e.type === type && e.stationId === id);
  return hits.length > nth ? Date.parse(hits[nth].ts) : NaN;
};
const anomalies = analyzeTelemetry(stationIds.map((id, i) => {
  // Election-day model: polls run ~10-12h, results follow within the hour.
  // (Audit timestamps are sim-time, so durations are modeled, not measured.)
  const signed = tsOf('RESULT_SIGNED', id);
  const closed = tsOf('POLL_CLOSED', id);
  const opens = events.filter((e) => e.type === 'POLL_OPENED' && e.stationId === id).length;
  return {
    id,
    turnoutPct: INJECT && i === 0 ? 99.2 : 54 + rand() * 5,
    invalidPct: 0.5,
    openMinutes: 600 + Math.floor(rand() * 120),
    resultDelayMinutes: !Number.isNaN(closed) && !Number.isNaN(signed)
      ? Math.min(60, Math.max(0, Math.round((signed - closed) / 60000)) + 5)
      : 10,
    exceptionCount: events.filter((e) => e.type === 'RESULT_EXCEPTION' && e.stationId === id).length,
    reopenCount: Math.max(0, opens - 1),
    recountMismatch: audits.get(id) === 'ESCALATED',
  };
}));
console.log(anomalies.length ? `Flags: ${JSON.stringify(anomalies)}` : 'No anomalies flagged.');
console.log(`Audit chain ok: ${audit.verifyChain().ok}`);

const pub = toPublic(resultPkgs, audits);
const csv = toCSV(pub);
console.log('\n--- results.csv (public) ---');
console.log(csv);

// Persist to file stores (all six) for CLI verification.
ensureDataDirs(DATA_ROOT);
saveElection({
  elections: [{ id: '2026-L-SIM', name: 'Tangier mock', date: '2026-09-23', status: 'closed' }],
  districts: [{ id: 'TANGER-ASILAH', electionId: '2026-L-SIM', name: 'Tanger-Asilah', seats: 5 }],
  stations: stationIds.map((id, i) => ({
    id, districtId: 'TANGER-ASILAH', name: id, registeredVoters: VOTERS_PER,
    status: 'closed' as const, deviceId: stationDevices.get(id) ?? '', firmwareHash: 'sha256:sim-firmware-v1',
  })),
  candidates: CANDIDATES.map((c) => ({ id: c, electionId: '2026-L-SIM', name: c, party: c })),
  officers: [],
}, DATA_ROOT);
saveVoters(simVoters, DATA_ROOT);
saveResults(resultPkgs, DATA_ROOT);
saveEvents(audit.all(), DATA_ROOT);
saveBallots(ballots.all(), DATA_ROOT);
// Station-local retention: each station keeps its own signed package + pubkey
// (DR copy #2 alongside the national aggregate; FULL_PLAN §32).
for (const pkg of resultPkgs) {
  const dir = join(DATA_ROOT, 'stations', pkg.polling_station);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify(pkg, null, 2) + '\n');
  const pub = devicePubkeys.get(pkg.polling_station);
  if (pub) writeFileSync(join(dir, 'device.pub.pem'), pub);
}
// Paper stream: one slip per electronic ballot (voter-verified record analogue).
// Slips carry choice only — never voter IDs (same rule as voting/client).
if (WITH_PAPER) {
  for (const b of ballots.all()) {
    const dir = join(DATA_ROOT, 'paper', b.stationId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${b.ballotId}.json`), JSON.stringify({
      slipId: b.ballotId, stationId: b.stationId,
      deviceId: stationDevices.get(b.stationId) ?? 'unknown',
      choiceId: b.choiceId, ts: b.ts, election: '2026-L-SIM',
    }, null, 2) + '\n');
  }
  console.log(`wrote paper slips for ${ballots.all().length} ballots`);
}
const incidentStore = loadIncidents(DATA_ROOT);
const auto = incidentsFromFlags(incidentStore, anomalies);
if (auto.length) {
  saveIncidents(incidentStore, DATA_ROOT);
  console.log(`Auto-opened ${auto.length} triaged incident(s) from anomaly flags (human review required).`);
} else if (anomalies.length) {
  console.log('Anomaly flags already have open incidents — no duplicates created.');
}
if (OUT_CSV) {
  writeFileSync(OUT_CSV, csv + '\n');
  console.log(`wrote ${resultPkgs.length} rows to ${OUT_CSV}`);
}
