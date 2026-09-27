// Polling-station machine — open → vote → close, state in file stores.
// This is the ONE place where identity and ballot domains meet, transiently:
// the voter is present and casting. It must NEVER persist voter↔ballot linkage:
//   - identity store keeps status=VOTED only (no ballot IDs)
//   - voting store keeps tokenHash only (no voter IDs)
//   - audit payloads carry ballot IDs only (no voter IDs)
//   - paper slips carry choice only (no voter IDs)
// Enforced by tests/paper.test.ts (data-level separation scan).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, participationReceipt, sha256Hex } from '../../../services/election-core/src/crypto-utils.js';
import {
  DATA_ROOT, ensureDataDirs, loadBallots, loadElection, loadEvents, loadResults, loadVoters,
  saveBallots, saveElection, saveEvents, saveResults, saveVoters,
} from '../../../services/election-core/src/store.js';
import type { AuditEvent, Ballot } from '../../../services/election-core/src/types.js';
import { EligibilityService } from '../../../services/eligibility/src/index.js';
import { BallotService } from '../../../services/ballot/src/index.js';
import { signResult, tally } from '../../../services/results/src/index.js';
import { reconcile } from '../../../services/audit/src/index.js';
import { signEvent } from '../../../services/audit/src/index.js';
import { createPublicKey, verify } from 'node:crypto';
import { ensureDevice, verifyFirmware } from './device.js';

export interface PaperSlip { slipId: string; stationId: string; deviceId: string; choiceId: string; ts: string; election: string; }

/**
 * Endorsement digest: sha256 over the tally CONTENT only (no timestamp), so an
 * officer can endorse the exact counts once and the endorsement stays valid
 * across re-signing. The device signature separately binds the timestamped package.
 */
export function endorsementDigest(p: {
  election: string; polling_station: string; device: string;
  ballots_issued: number; ballots_counted: number; invalid_ballots: number;
  results: Record<string, number>; firmware_hash: string;
}): string {
  return sha256Hex(canonical({
    election: p.election, polling_station: p.polling_station, device: p.device,
    ballots_issued: p.ballots_issued, ballots_counted: p.ballots_counted,
    invalid_ballots: p.invalid_ballots, results: p.results, firmware_hash: p.firmware_hash,
  }));
}

export function paperDir(root: string, stationId: string): string {
  return join(root, 'paper', stationId);
}

function audit(
  root: string, type: string, stationId: string, deviceId: string,
  payload: Record<string, unknown>, privateKeyPem?: string,
): void {
  const events = loadEvents(root);
  const seq = events.length;
  const ts = new Date().toISOString();
  const prevHash = events.length ? events[events.length - 1].hash : 'GENESIS';
  const hash = sha256Hex(prevHash + '|' + canonical({ seq, ts, type, stationId, deviceId, payload }));
  const ev: AuditEvent = { seq, ts, type, stationId, deviceId, payload, prevHash, hash };
  if (privateKeyPem) ev.signature = signEvent(hash, privateKeyPem);
  events.push(ev);
  saveEvents(events, root);
}

function stationPrivKey(root: string, stationId: string): string | undefined {
  const p = join(root, 'stations', stationId, 'device.priv.pem');
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
}

/** Open the polls: firmware gate + ≥2 approvals. */
export function openMachine(root: string, stationId: string, measuredFirmware: string, approvals: string[]): void {
  if (approvals.length < 2) throw new Error(`open requires >=2 approvals (got ${approvals.length})`);
  const s = loadElection(root);
  const st = s.stations.find((x) => x.id === stationId);
  if (!st) throw new Error(`unknown station ${stationId}`);
  if (st.status === 'open') throw new Error(`${stationId} already open`);
  const registered = st.firmwareHash || measuredFirmware;
  const { record, privateKeyPem } = ensureDevice(root, stationId, st.deviceId, registered);
  verifyFirmware(record, measuredFirmware, stationId);
  st.status = 'open';
  saveElection(s, root);
  audit(root, 'POLL_OPENED', stationId, st.deviceId, { approvals, firmwareHash: record.firmwareHash }, privateKeyPem);
}

/** Cast one ballot: authorize → cast → print slip → (confirm) → deposit. */
export function castBallot(
  root: string, stationId: string, voterId: string, choiceId: string, confirm = true,
): { ballotId: string; receipt: string } {
  const s = loadElection(root);
  const st = s.stations.find((x) => x.id === stationId);
  if (!st) throw new Error(`unknown station ${stationId}`);
  if (st.status !== 'open') throw new Error(`${stationId} is not open`);
  const validChoices = new Set(s.candidates.filter((c) => c.electionId === (s.elections[0]?.id ?? c.electionId)).map((c) => c.id));
  if (validChoices.size && !validChoices.has(choiceId)) throw new Error(`invalid choice ${choiceId}`);

  const voters = loadVoters(root);
  const rec = voters.find((v) => v.voterId === voterId && v.stationId === stationId);
  if (!rec) throw new Error(`unknown voter ${voterId} at ${stationId}`);
  if (!rec.eligible) throw new Error(`ineligible voter ${voterId}`);
  if (rec.status === 'VOTED') throw new Error(`double vote blocked for ${voterId}`);

  // Transient in-memory bridge: voter → token → ballot. Nothing linking persists.
  const mem = new EligibilityService();
  mem.register({ ...rec });
  const { token } = mem.authorize(voterId);
  const booth = new BallotService(mem);
  const ballot: Ballot = booth.cast(token, stationId, choiceId, validChoices.size ? validChoices : new Set([choiceId]));

  if (!confirm) throw new Error('voter rejected the paper slip — ballot spoiled, not deposited');

  rec.status = 'VOTED';
  saveVoters(voters, root);
  const all = loadBallots(root);
  all.push(ballot);
  saveBallots(all, root);

  const slip: PaperSlip = {
    slipId: ballot.ballotId, stationId, deviceId: st.deviceId,
    choiceId: ballot.choiceId, ts: ballot.ts, election: s.elections[0]?.id ?? '',
  };
  mkdirSync(paperDir(root, stationId), { recursive: true });
  writeFileSync(join(paperDir(root, stationId), `${ballot.ballotId}.json`), JSON.stringify(slip, null, 2) + '\n');
  audit(root, 'BALLOT_CAST', stationId, st.deviceId, { ballot: ballot.ballotId }, stationPrivKey(root, stationId));
  return { ballotId: ballot.ballotId, receipt: participationReceipt(ballot.ballotId) };
}

/** Close the polls: reconcile paper↔electronic, refuse to sign on mismatch, else sign.
 * Dual control: stations with registered officer keys additionally require ≥1
 * officer endorsement signature over the exact result_hash (device key + human
 * key must both bind the same hash). Stations without officer keys skip this. */
export function closeMachine(
  root: string, stationId: string, approvals: string[],
  opts: { endorsements?: { officer: string; signature: string }[] } = {},
) {
  if (approvals.length < 3) throw new Error(`close requires >=3 approvals (got ${approvals.length})`);
  const s = loadElection(root);
  const st = s.stations.find((x) => x.id === stationId);
  if (!st) throw new Error(`unknown station ${stationId}`);
  if (st.status !== 'open') throw new Error(`${stationId} is not open`);

  const voters = loadVoters(root);
  const authorized = voters.filter((v) => v.stationId === stationId && v.status === 'VOTED').length;
  const ballots = loadBallots(root).filter((b) => b.stationId === stationId);
  const pdir = paperDir(root, stationId);
  const paper = existsSync(pdir) ? readdirSync(pdir).filter((f) => f.endsWith('.json')).length : 0;

  const rec = reconcile({ authorized, electronic: ballots.length, paper });
  if (!rec.ok) {
    audit(root, 'RESULT_EXCEPTION', stationId, st.deviceId, { detail: rec.detail, approvals });
    throw new Error(rec.detail);
  }
  const { results, counted } = tally(ballots);
  const privPath = join(root, 'stations', stationId, 'device.priv.pem');
  if (!existsSync(privPath)) throw new Error(`${stationId}: no device private key (open first)`);
  const devicePriv = readFileSync(privPath, 'utf8');
  const pkg = signResult({
    election: s.elections[0]?.id ?? 'ELECTION', polling_station: stationId, device: st.deviceId,
    ballots_issued: authorized, ballots_counted: counted, invalid_ballots: 0,
    results, timestamp: new Date().toISOString(), firmware_hash: st.firmwareHash,
  }, devicePriv);

  const keyedOfficers = s.officers.filter((o) => o.stationId === stationId && o.pubkeyPem);
  const endorsers: string[] = [];
  const digest = endorsementDigest({
    election: s.elections[0]?.id ?? 'ELECTION', polling_station: stationId, device: st.deviceId,
    ballots_issued: authorized, ballots_counted: counted, invalid_ballots: 0,
    results, firmware_hash: st.firmwareHash,
  });
  if (keyedOfficers.length) {
    for (const e of opts.endorsements ?? []) {
      const off = keyedOfficers.find((o) => o.id === e.officer);
      if (!off?.pubkeyPem) continue;
      try {
        if (verify(null, Buffer.from(digest, 'hex'),
          createPublicKey(off.pubkeyPem), Buffer.from(e.signature.trim(), 'hex'))) {
          endorsers.push(off.id);
        }
      } catch { /* invalid endorsement — ignored, quorum decides */ }
    }
    if (!endorsers.length) {
      throw new Error(`${stationId}: no valid officer endorsement over tally ${digest} (dual control)`);
    }
  }

  const results_ = loadResults(root).filter((r) => r.polling_station !== stationId);
  results_.push(pkg);
  saveResults(results_, root);
  mkdirSync(join(root, 'stations', stationId), { recursive: true });
  writeFileSync(join(root, 'stations', stationId, 'result.json'), JSON.stringify(pkg, null, 2) + '\n');
  st.status = 'closed';
  saveElection(s, root);
  audit(root, 'POLL_CLOSED', stationId, st.deviceId, { approvals, reconcile: rec.detail, endorsers }, devicePriv);
  audit(root, 'RESULT_SIGNED', stationId, st.deviceId, { result_hash: pkg.result_hash }, devicePriv);
  return pkg;
}

export { DATA_ROOT, ensureDataDirs };
