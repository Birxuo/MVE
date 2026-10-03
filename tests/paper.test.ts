// Paper-trail tests — station session, firmware gate, close refusal,
// and DATA-LEVEL separation: no voter↔ballot linkage persisted anywhere.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import {
  ensureDataDirs, loadBallots, loadElection, loadEvents, loadResults, loadVoters,
  saveBallots, saveElection, saveResults, saveVoters,
} from '../services/election-core/src/store.js';
import { castBallot, closeMachine, endorsementDigest, openMachine, paperDir, verifyParticipationReceipt } from '../voting/client/src/machine.js';
import { participationReceipt } from '../services/election-core/src/crypto-utils.js';

const FW = 'sha256:sim-firmware-v1';

function seed(root: string, voters = ['V1', 'V2', 'V3', 'V4']): void {
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

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'mve-paper-'));
}

/** Every file under dir (recursive) as text. */
function allText(root: string, sub: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.json')) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(root, sub));
  return out;
}

describe('paper: full station session', () => {
  it('open → vote → close signs; spoil and double-vote blocked', () => {
    const root = tmp();
    seed(root);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    const r1 = castBallot(root, 'S1', 'V1', 'party_a');
    assert.ok(r1.ballotId && r1.receipt);
    assert.throws(() => castBallot(root, 'S1', 'V1', 'party_a'), /double vote/);
    assert.throws(() => castBallot(root, 'S1', 'V2', 'party_a', false), /spoiled/);
    assert.equal(loadVoters(root).find((v) => v.voterId === 'V2')?.status, 'NOT_VOTED');
    castBallot(root, 'S1', 'V2', 'party_b');
    castBallot(root, 'S1', 'V3', 'party_a');
    const pkg = closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);
    assert.equal(pkg.ballots_counted, 3);
    assert.deepEqual(pkg.results, { party_a: 2, party_b: 1 });
    assert.equal(readdirSync(paperDir(root, 'S1')).length, 3);
    rmSync(root, { recursive: true, force: true });
  });

  it('wrong firmware refuses open; close needs 3 approvals', () => {
    const root = tmp();
    seed(root);
    assert.throws(() => openMachine(root, 'S1', 'sha256:evil', ['presiding', 'observer']), /firmware mismatch/);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    assert.throws(() => closeMachine(root, 'S1', ['presiding', 'observer']), />=3 approvals/);
    rmSync(root, { recursive: true, force: true });
  });

  it('bound-but-unapproved firmware refuses open via the release manifest', () => {
    const root = tmp();
    seed(root);
    const s = loadElection(root);
    s.stations[0].firmwareHash = 'sha256:custom-unapproved-build';
    saveElection(s, root);
    // Binding matches (same hash registered + measured) — the manifest still refuses.
    assert.throws(
      () => openMachine(root, 'S1', 'sha256:custom-unapproved-build', ['presiding', 'observer']),
      /not in the approved release manifest/,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('missing slip refuses close with RESULT_EXCEPTION (no signature)', () => {
    const root = tmp();
    seed(root);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    castBallot(root, 'S1', 'V1', 'party_a');
    const slips = readdirSync(paperDir(root, 'S1'));
    unlinkSync(join(paperDir(root, 'S1'), slips[0]));
    assert.throws(() => closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']), /EXCEPTION/);
    assert.equal(loadResults(root).length, 0);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('paper: no voter↔ballot linkage persisted', () => {
  it('voting+paper files hold no voter IDs; identity holds no ballot data; audit holds no voter IDs', () => {
    const root = tmp();
    seed(root, ['ALICE-V1', 'BOB-V2']);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    castBallot(root, 'S1', 'ALICE-V1', 'party_a');
    castBallot(root, 'S1', 'BOB-V2', 'party_b');
    closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);

    for (const text of allText(root, 'voting')) {
      assert.doesNotMatch(text, /ALICE|BOB|V1"|V2"|voterId/i);
    }
    for (const text of allText(root, 'paper')) {
      assert.doesNotMatch(text, /ALICE|BOB|voterId/i);
    }
    for (const text of allText(root, 'identity')) {
      assert.doesNotMatch(text, /ballotId|choiceId|party_a|party_b/);
    }
    for (const text of allText(root, 'audit')) {
      assert.doesNotMatch(text, /ALICE|BOB/);
    }
    // Ballot IDs in voting store never appear in identity store.
    const ballotIds = loadBallots(root).map((b) => b.ballotId);
    const identityText = allText(root, 'identity').join('\n');
    for (const id of ballotIds) assert.ok(!identityText.includes(id), `ballot ${id} leaked into identity`);
    rmSync(root, { recursive: true, force: true });
  });

  it('close replaces only its own station entry', () => {    const root = tmp();
    seed(root, ['V1']);
    saveResults([{
      election: 'E1', polling_station: 'FOREIGN', device: 'M-999', ballots_issued: 5,
      ballots_counted: 5, invalid_ballots: 0, results: { party_a: 5 },
      timestamp: '2026-09-23T19:05:00Z', firmware_hash: FW,
      result_hash: 'foreign', signature: 'foreign',
    }], root);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    castBallot(root, 'S1', 'V1', 'party_b');
    closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']);
    const rows = loadResults(root);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.find((r) => r.polling_station === 'FOREIGN'), {
      election: 'E1', polling_station: 'FOREIGN', device: 'M-999', ballots_issued: 5,
      ballots_counted: 5, invalid_ballots: 0, results: { party_a: 5 },
      timestamp: '2026-09-23T19:05:00Z', firmware_hash: FW,
      result_hash: 'foreign', signature: 'foreign',
    });
    assert.ok(loadEvents(root).some((e) => e.type === 'RESULT_SIGNED'));
    rmSync(root, { recursive: true, force: true });
  });
});

describe('paper: bulk simulator output stays separated', () => {  it('2-station --paper run: voting+paper hold no voter IDs, identity holds no ballot data', () => {
    const root = tmp();
    const run = spawnSync(process.execPath, [
      join(process.cwd(), 'dist/research/simulations/simulate.js'),
      '--stations', '2', '--voters', '4', '--seed', '1', '--paper', '--data', root,
    ], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr.slice(-500));
    for (const text of allText(root, 'voting')) {
      assert.doesNotMatch(text, /-V\d/);
      assert.doesNotMatch(text, /voterId/i);
    }
    for (const text of allText(root, 'paper')) {
      assert.doesNotMatch(text, /-V\d/);
      assert.doesNotMatch(text, /voterId/i);
    }
    for (const text of allText(root, 'identity')) {
      assert.doesNotMatch(text, /ballotId|choiceId|party_a|party_b|party_c/);
    }
    rmSync(root, { recursive: true, force: true });
  });
});

describe('paper: officer endorsement (dual control)', () => {
  it('close refuses without endorsement once officer keys exist; valid endorsement closes', () => {
    const root = tmp();
    seed(root, ['V1']);
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const s = loadElection(root);
    s.officers.push({
      id: 'OFF-1', stationId: 'S1', role: 'presiding',
      pubkeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    saveElection(s, root);

    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    castBallot(root, 'S1', 'V1', 'party_a');
    assert.throws(
      () => closeMachine(root, 'S1', ['presiding', 'deputy', 'observer']),
      /dual control/,
    );
    assert.equal(loadResults(root).length, 0);
    // Wrong-hash endorsement is ignored → still refused.
    assert.throws(
      () => closeMachine(root, 'S1', ['presiding', 'deputy', 'observer'], {
        endorsements: [{ officer: 'OFF-1', signature: '00'.repeat(64) }],
      }),
      /dual control/,
    );
    // Endorse the exact tally digest, then close.
    const digest = endorsementDigest({
      election: 'E1', polling_station: 'S1', device: 'M-001',
      ballots_issued: 1, ballots_counted: 1, invalid_ballots: 0,
      results: { party_a: 1 }, firmware_hash: FW,
    });
    const sig = sign(null, Buffer.from(digest, 'hex'), createPrivateKey(privPem)).toString('hex');
    const pkg = closeMachine(root, 'S1', ['presiding', 'deputy', 'observer'], {
      endorsements: [{ officer: 'OFF-1', signature: sig }],
    });
    assert.equal(pkg.ballots_counted, 1);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('paper: commitment-bound receipts (choice-free inclusion proof)', () => {
  it('cast hands (ballotId, code, blinding); code is not the legacy deterministic value', () => {
    const root = tmp();
    seed(root, ['V1', 'V2']);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    const r = castBallot(root, 'S1', 'V1', 'party_a');
    assert.match(r.receipt, /^[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.equal(r.blinding.length, 32);
    assert.notEqual(r.receipt, participationReceipt(r.ballotId));
    // Same choice, second voter → different receipt (blinding is per-ballot random).
    const r2 = castBallot(root, 'S1', 'V2', 'party_a');
    assert.notEqual(r2.receipt, r.receipt);
    assert.notEqual(r2.blinding, r.blinding);
    rmSync(root, { recursive: true, force: true });
  });

  it('verify round-trips the triple; wrong blinding or unknown ballot fails', () => {
    const root = tmp();
    seed(root, ['V1']);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    const r = castBallot(root, 'S1', 'V1', 'party_b');
    assert.deepEqual(
      verifyParticipationReceipt(root, { ballotId: r.ballotId, code: r.receipt, blinding: r.blinding }),
      { included: true, station: 'S1' },
    );
    assert.deepEqual(
      verifyParticipationReceipt(root, { ballotId: r.ballotId, code: r.receipt, blinding: '00'.repeat(16) }),
      { included: false },
    );
    assert.deepEqual(
      verifyParticipationReceipt(root, { ballotId: r.ballotId, code: r.receipt }),
      { included: false },
    );
    assert.deepEqual(
      verifyParticipationReceipt(root, { ballotId: 'nope', code: r.receipt, blinding: r.blinding }),
      { included: false },
    );
    // Blinding never persists: the store holds the commitment, not the secret.
    const stored = readFileSync(join(root, 'voting', 'ballots.json'), 'utf8');
    assert.doesNotMatch(stored, new RegExp(r.blinding));
    assert.match(stored, /"commitment": "[0-9a-f]{64}"/);
    rmSync(root, { recursive: true, force: true });
  });

  it('legacy pre-commitment rows still verify via the old deterministic code', () => {
    const root = tmp();
    seed(root, ['V1']);
    openMachine(root, 'S1', FW, ['presiding', 'observer']);
    const r = castBallot(root, 'S1', 'V1', 'party_a');
    // Strip the commitment → legacy row.
    saveBallots(loadBallots(root).map((b) => ({ ...b, commitment: undefined })), root);
    assert.deepEqual(
      verifyParticipationReceipt(root, { ballotId: r.ballotId, code: participationReceipt(r.ballotId) }),
      { included: true, station: 'S1' },
    );
    rmSync(root, { recursive: true, force: true });
  });
});
