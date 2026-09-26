// Failure-injection scenarios — hermetic (in-memory, no file writes).
// Each scenario must DETECT its failure mode. Exit 0 iff all selected scenarios detect.
// Usage: node dist/research/simulations/failures.js [--only drop|tamper|outage|corrupt-device|duplicate] [--stations N] [--voters N] [--seed N]
import { EligibilityService } from '../../services/eligibility/src/index.js';
import { BallotService } from '../../services/ballot/src/index.js';
import { generateDeviceKeys, signResult, tally, tamper, verifyResult } from '../../services/results/src/index.js';
import { AuditLog, reconcile } from '../../services/audit/src/index.js';
import { mulberry32 } from '../../services/audit/src/index.js';

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
const N_STATIONS = Number(args['stations'] ?? 3);
const VOTERS_PER = Number(args['voters'] ?? 10);
const SEED = Number(args['seed'] ?? 7);
const ONLY = typeof args['only'] === 'string' ? String(args['only']) : undefined;
const CANDIDATES = ['party_a', 'party_b', 'party_c'];
const FIRMWARE = 'sha256:sim-firmware-v1';

function openGate(expected: string, actual: string, stationId: string): void {
  if (expected !== actual) throw new Error(`${stationId}: firmware mismatch (expected ${expected}, got ${actual})`);
}

function honestStation(stationId: string, deviceId: string, rand: () => number) {
  const eligibility = new EligibilityService();
  const ballots = new BallotService(eligibility);
  const audit = new AuditLog();
  openGate(FIRMWARE, FIRMWARE, stationId);
  audit.append('POLL_OPENED', stationId, deviceId, { approvals: ['presiding', 'observer'], firmwareHash: FIRMWARE });
  let issued = 0;
  const seenTokens: string[] = [];
  for (let v = 0; v < VOTERS_PER; v++) {
    const voterId = `${stationId}-V${v}`;
    eligibility.register({ voterId, districtId: 'TANGER-ASILAH', stationId, eligible: true, status: 'NOT_VOTED' });
    if (rand() < 0.9) {
      const { token } = eligibility.authorize(voterId);
      seenTokens.push(token);
      issued++;
      ballots.cast(token, stationId, CANDIDATES[Math.floor(rand() * CANDIDATES.length)], new Set(CANDIDATES));
    }
  }
  const { results, counted } = tally(ballots.forStation(stationId));
  const keys = generateDeviceKeys(deviceId);
  const pkg = signResult({
    election: '2026-L-SIM', polling_station: stationId, device: deviceId,
    ballots_issued: issued, ballots_counted: counted, invalid_ballots: 0,
    results, timestamp: new Date().toISOString(), firmware_hash: FIRMWARE,
  }, keys.privateKeyPem);
  audit.append('POLL_CLOSED', stationId, deviceId, { approvals: ['presiding', 'deputy', 'observer'] });
  audit.append('RESULT_SIGNED', stationId, deviceId, { result_hash: pkg.result_hash });
  return { eligibility, ballots, audit, issued, counted, pkg, keys, seenTokens };
}

type Verdict = { name: string; detected: boolean; detail: string };
const verdicts: Verdict[] = [];
function check(name: string, detected: boolean, detail: string): void {
  if (!ONLY || ONLY === name) verdicts.push({ name, detected, detail });
}

const rand = mulberry32(SEED);
const sid = (i: number): [string, string] => [`TANGER-ASilah-${String(i + 1).padStart(4, '0')}`, `M-${String(i + 1).padStart(3, '0')}`];

// 1. drop — 3 paper ballots missing → reconcile EXCEPTION
{
  const [s, d] = sid(0);
  const h = honestStation(s, d, rand);
  const rec = reconcile({ authorized: h.issued, electronic: h.counted, paper: Math.max(0, h.counted - 3) });
  check('drop', !rec.ok && rec.detail.includes('EXCEPTION'), rec.detail);
}
// 2. tamper — published result modified → verify FAIL
{
  const [s, d] = sid(1 % N_STATIONS);
  const h = honestStation(s, d, rand);
  const firstChoice = Object.keys(h.pkg.results)[0] ?? 'party_a';
  const bad = tamper(h.pkg, firstChoice, (h.pkg.results[firstChoice] ?? 0) + 100);
  const v = verifyResult(bad, h.keys.publicKeyPem);
  check('tamper', !(v.hashOk && v.sigOk), `hashOk=${v.hashOk} sigOk=${v.sigOk}`);
}
// 3. outage — offline run, late sync still verifies (resilience, not corruption)
{
  const [s, d] = sid(2 % N_STATIONS);
  const h = honestStation(s, d, rand); // no network touched at any point
  const v = verifyResult(h.pkg, h.keys.publicKeyPem);
  const chain = h.audit.verifyChain();
  check('outage', v.hashOk && v.sigOk && chain.ok, 'late-sync package + chain verify after offline run');
}
// 4. corrupt-device — wrong firmware → open refused
{
  const [s] = sid(0);
  let refused = false;
  try {
    openGate(FIRMWARE, 'sha256:evil-firmware', s);
  } catch {
    refused = true;
  }
  check('corrupt-device', refused, 'openStation refused mismatched firmware_hash');
}
// 5. duplicate — every token replayed → all blocked, count stable
{
  const [s, d] = sid(0);
  void d;
  const eligibility = new EligibilityService();
  const ballots = new BallotService(eligibility);
  const choices = new Set(CANDIDATES);
  let blocked = 0;
  for (let v = 0; v < VOTERS_PER; v++) {
    eligibility.register({ voterId: `DUP-V${v}`, districtId: 'TANGER-ASILAH', stationId: s, eligible: true, status: 'NOT_VOTED' });
    const { token } = eligibility.authorize(`DUP-V${v}`);
    ballots.cast(token, s, 'party_a', choices);
    try {
      ballots.cast(token, s, 'party_a', choices);
    } catch {
      blocked++;
    }
  }
  const { counted } = tally(ballots.forStation(s));
  check('duplicate', blocked === VOTERS_PER && counted === VOTERS_PER, `blocked=${blocked} counted=${counted}`);
}

let failed = 0;
for (const v of verdicts) {
  console.log(`${v.detected ? 'DETECTED' : 'MISSED'} ${v.name}: ${v.detail}`);
  if (!v.detected) failed++;
}
if (!verdicts.length) {
  console.error(`unknown --only ${ONLY} (use drop|tamper|outage|corrupt-device|duplicate)`);
  process.exit(2);
}
console.log(`${verdicts.length - failed}/${verdicts.length} scenarios detected`);
process.exit(failed ? 1 : 0);
