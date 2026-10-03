// DR tests — aggregate loss rebuilds from station copies; gaps refuse;
// a surviving off-site copy (--from) rebuilds a wiped national root.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ensureDataDirs, loadEvents, loadResults, saveElection, saveVoters,
} from '../services/election-core/src/store.js';
import { castBallot, closeMachine, openMachine } from '../voting/client/src/machine.js';

const FW = 'sha256:sim-firmware-v1';
const APPROVALS_OPEN = ['presiding', 'observer'];
const APPROVALS_CLOSE = ['presiding', 'deputy', 'observer'];

function seed(root: string): void {
  ensureDataDirs(root);
  saveElection({
    elections: [{ id: 'E1', name: 'E1', date: '2026-09-23', status: 'draft' }],
    districts: [{ id: 'D1', electionId: 'E1', name: 'D1', seats: 1 }],
    stations: ['S1', 'S2'].map((id, i) => ({
      id, districtId: 'D1', name: id, registeredVoters: 2,
      status: 'closed' as const, deviceId: `M-00${i + 1}`, firmwareHash: FW,
    })),
    candidates: [{ id: 'party_a', electionId: 'E1', name: 'A', party: 'party_a' }],
    officers: [],
  }, root);
  saveVoters(['S1', 'S2'].flatMap((s) => [1, 2].map((v) => ({
    voterId: `${s}-V${v}`, districtId: 'D1', stationId: s, eligible: true, status: 'NOT_VOTED' as const,
  }))), root);
}

function runElection(root: string): void {
  for (const s of ['S1', 'S2']) {
    openMachine(root, s, FW, APPROVALS_OPEN);
    castBallot(root, s, `${s}-V1`, 'party_a');
    closeMachine(root, s, APPROVALS_CLOSE);
  }
}

function recover(root: string, from?: string): { status: number | null; out: string } {
  const args = [join(process.cwd(), 'dist/research/simulations/recover.js'), '--data', root];
  if (from) args.push('--from', from);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout + r.stderr).slice(-400) };
}

describe('recover: aggregate loss rebuilds from station copies', () => {
  it('deleted results.json is rewritten with identical hashes + recovery receipt', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rec-'));
    seed(root);
    runElection(root);
    const before = loadResults(root).map((r) => r.result_hash);
    assert.equal(before.length, 2);
    rmSync(join(root, 'transparency', 'results.json'));
    assert.deepEqual(loadResults(root), []);
    const r = recover(root);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(loadResults(root).map((x) => x.result_hash), before);
    assert.ok(loadEvents(root).some((e) => e.type === 'RECOVERY_COMPLETED'), 'recovery receipt logged');
    rmSync(root, { recursive: true, force: true });
  });

  it('missing station copy refuses with a gap (aggregate untouched)', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rec-'));
    seed(root);
    runElection(root);
    rmSync(join(root, 'transparency', 'results.json'));
    rmSync(join(root, 'stations', 'S2', 'result.json'));
    const r = recover(root);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /MISSING: S2/);
    assert.deepEqual(loadResults(root), []);
    rmSync(root, { recursive: true, force: true });
  });

  it('--from rebuilds a wiped national root from the surviving copy', () => {
    const national = mkdtempSync(join(tmpdir(), 'mve-rec-nat-'));
    const backup = mkdtempSync(join(tmpdir(), 'mve-rec-bak-'));
    seed(national);
    runElection(national);
    const before = loadResults(national).map((x) => x.result_hash);
    // Off-site copy: station packages + audit log (the 3-copy model).
    cpSync(join(national, 'stations'), join(backup, 'stations'), { recursive: true });
    cpSync(join(national, 'audit'), join(backup, 'audit'), { recursive: true });
    // Disaster: national aggregate AND national station copies destroyed.
    rmSync(join(national, 'transparency', 'results.json'));
    rmSync(join(national, 'stations'), { recursive: true, force: true });
    const r = recover(national, backup);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(loadResults(national).map((x) => x.result_hash), before);
    // The rebuilt national root is self-describing: receipt references the copy.
    const receipt = loadEvents(national).find((e) => e.type === 'RECOVERY_COMPLETED');
    assert.ok(receipt);
    assert.equal((receipt.payload as Record<string, unknown>).stations, 2);
    rmSync(national, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
  });

  it('empty --from (no POLL_CLOSED) exits 2 instead of writing an empty aggregate', () => {
    const national = mkdtempSync(join(tmpdir(), 'mve-rec-nat-'));
    const backup = mkdtempSync(join(tmpdir(), 'mve-rec-bak-'));
    ensureDataDirs(backup);
    const r = recover(national, backup);
    assert.equal(r.status, 2, r.out);
    assert.deepEqual(loadResults(national), []);
    rmSync(national, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
  });
});
