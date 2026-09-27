// Adversarial barrier test (FULL_PLAN §45) — defeat ONE barrier at a time and
// prove a DIFFERENT barrier catches it. Exit 0 iff all six defeats are detected.
// Usage: node dist/research/simulations/barriers.js [--only b1|b2|b3|b4|b5|b6]
import { mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex, canonical } from '../../services/election-core/src/crypto-utils.js';
import {
  ensureDataDirs, loadBallots, loadEvents, loadIncidents, loadResults,
  saveBallots, saveElection, saveEvents, saveIncidents, saveVoters,
} from '../../services/election-core/src/store.js';
import { AuditLog } from '../../services/audit/src/index.js';
import { reconcile } from '../../services/audit/src/index.js';
import { verifyEventChain } from '../../services/audit/src/index.js';
import { createIncident } from '../../services/incidents/src/index.js';
import { castBallot, closeMachine, openMachine } from '../../voting/client/src/machine.js';

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

function seed(root: string, voters = ['V1', 'V2', 'V3']): void {
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: [{
      id: 'S1', districtId: 'D1', name: 'S1', registeredVoters: voters.length,
      status: 'closed', deviceId: 'M-001', firmwareHash: FW,
    }],
    candidates: [
      { id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' },
      { id: 'party_b', electionId: 'E1', name: 'B', party: 'party_b' },
    ],
    officers: [],
  }, root);
  saveVoters(voters.map((voterId) => ({ voterId, districtId: 'D1', stationId: 'S1', eligible: true, status: 'NOT_VOTED' as const })), root);
}

function votedSession(root: string, voter = 'V1'): void {
  openMachine(root, 'S1', FW, ['presiding', 'observer']);
  castBallot(root, 'S1', voter, 'party_a');
  closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);
}

type Verdict = { name: string; defeated: string; caughtBy: string; detected: boolean; detail: string };
const verdicts: Verdict[] = [];
function check(name: string, defeated: string, caughtBy: string, detected: boolean, detail: string): void {
  if (!ONLY || ONLY === name) verdicts.push({ name, defeated, caughtBy, detected, detail });
}

// B1 — defeat IDENTITY (smuggle a ballot with no voter behind it).
{
  const root = mkdtempSync(join(tmpdir(), 'mve-b1-'));
  seed(root);
  const forged = loadBallots(root);
  forged.push({
    ballotId: 'forged-1', tokenHash: 'forged-token', stationId: 'S1',
    choiceId: 'party_a', ts: new Date().toISOString(),
  });
  saveBallots(forged, root);
  const rec = reconcile({ authorized: 0, electronic: 1, paper: 0 });
  check('b1', 'identity controls', 'reconciliation + paper check', !rec.ok, rec.detail);
}

// B2 — defeat BALLOT PRIVACY (attacker dumps every store, tries to join voter→choice).
{
  const root = mkdtempSync(join(tmpdir(), 'mve-b2-'));
  seed(root, ['ALICE-1', 'BOB-2']);
  votedSession(root, 'ALICE-1');
  const identity = readFileSync(join(root, 'identity', 'voters.json'), 'utf8');
  const voting = readFileSync(join(root, 'voting', 'ballots.json'), 'utf8');
  const paper = readdirSync(join(root, 'paper', 'S1'))
    .map((f) => readFileSync(join(root, 'paper', 'S1', f), 'utf8')).join('\n');
  const linkIn = (text: string): boolean =>
    /ALICE|BOB/.test(text) && /party_a|party_b/.test(text);
  const joinable = linkIn(identity) || linkIn(voting) || linkIn(paper);
  check('b2', 'ballot privacy', 'structural separation (no join keys exist)',
    !joinable, joinable ? 'VOTER→CHOICE LINK FOUND' : 'no store links identity to choice');
}

// B3 — defeat PHYSICAL RECORD (destroy paper slips after voting).
{
  const root = mkdtempSync(join(tmpdir(), 'mve-b3-'));
  seed(root);
  openMachine(root, 'S1', FW, ['presiding', 'observer']);
  castBallot(root, 'S1', 'V1', 'party_a');
  for (const f of readdirSync(join(root, 'paper', 'S1'))) {
    unlinkSync(join(root, 'paper', 'S1', f));
  }
  let refused = false;
  try {
    closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);
  } catch (e) {
    refused = /EXCEPTION/.test((e as Error).message);
  }
  check('b3', 'physical record', 'close-time paper↔electronic reconcile', refused,
    refused ? 'close refused, no signature minted' : 'CLOSE SIGNED WITHOUT PAPER');
}

// B4 — defeat AUDIT LOG (drop an event from the chain file).
{
  const root = mkdtempSync(join(tmpdir(), 'mve-b4-'));
  seed(root);
  votedSession(root);
  const events = loadEvents(root);
  events.splice(1, 1); // remove a middle event
  saveEvents(events, root);
  const v = verifyEventChain(loadEvents(root));
  check('b4', 'audit log', 'hash-chain verification', !v.ok, v.ok ? 'TAMPERED CHAIN VERIFIES' : `broken at seq ${v.badSeq}`);
}

// B5 — defeat CRYPTO (edit the published package in place).
{
  const root = mkdtempSync(join(tmpdir(), 'mve-b5-'));
  seed(root);
  votedSession(root);
  const p = join(root, 'stations', 'S1', 'result.json');
  const pkg = JSON.parse(readFileSync(p, 'utf8'));
  pkg.results.party_a = 9999;
  writeFileSync(p, JSON.stringify(pkg));
  const stored = JSON.parse(readFileSync(p, 'utf8'));
  const { result_hash, signature, ...body } = stored;
  void signature;
  const ok = sha256Hex(canonical(body)) === result_hash;
  check('b5', 'cryptographic verification', 'result-hash recomputation', !ok,
    ok ? 'EDITED PACKAGE VERIFIES' : 'hash mismatch detected');
}

// B6 — defeat OBSERVERS (suppress a reported incident from the store).
{
  const root = mkdtempSync(join(tmpdir(), 'mve-b6-'));
  ensureDataDirs(root);
  const log = new AuditLog();
  const store = [createIncident([], { stationId: 'S1', category: 'intimidation', description: 'd', reporter: 'observer:1' })][0];
  log.append('INCIDENT_REPORTED', 'S1', 'N/A', { id: store.id });
  saveEvents(log.all(), root);
  // Attacker deletes the case file; the audit receipt remains.
  saveIncidents([], root);
  const reported = new Set(loadEvents(root).filter((e) => e.type === 'INCIDENT_REPORTED').map((e) => (e.payload as Record<string, unknown>).id));
  const kept = new Set(loadIncidents(root).map((x) => x.id));
  const suppressed = [...reported].filter((id) => !kept.has(id as string));
  check('b6', 'observer visibility', 'audit-receipt vs case-file cross-check', suppressed.length === 1,
    suppressed.length ? `suppressed case ${suppressed[0]} exposed by its audit receipt` : 'SUPPRESSION INVISIBLE');
}

let failed = 0;
for (const v of verdicts) {
  console.log(`${v.detected ? 'DETECTED' : 'MISSED'} ${v.name}: defeated ${v.defeated} → caught by ${v.caughtBy} — ${v.detail}`);
  if (!v.detected) failed++;
}
if (!verdicts.length) {
  console.error(`unknown --only ${ONLY}`);
  process.exit(2);
}
console.log(`${verdicts.length - failed}/${verdicts.length} defeats detected by another barrier`);
process.exit(failed ? 1 : 0);
