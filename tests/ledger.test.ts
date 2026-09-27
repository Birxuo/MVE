import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCheckpoint, inclusionProof, leafFor, merkleRoot, verifyLedger, verifyProof,
  type LedgerCheckpoint,
} from '../services/transparency/src/ledger.js';
import { generateDeviceKeys, signResult } from '../services/results/src/index.js';
import type { ResultPackage } from '../services/election-core/src/types.js';

function pkg(station: string, votes: number): ResultPackage {
  const keys = generateDeviceKeys('M-' + station);
  return signResult({
    election: 'E', polling_station: station, device: 'M-' + station,
    ballots_issued: votes, ballots_counted: votes, invalid_ballots: 0,
    results: { party_a: votes }, timestamp: '2026-09-23T19:05:00Z', firmware_hash: 'sha256:x',
  }, keys.privateKeyPem);
}

describe('ledger: roots and checkpoints', () => {
  it('root is order-independent; chain links verify; tamper breaks', () => {
    const pkgs = [pkg('S1', 10), pkg('S2', 20), pkg('S3', 30)];
    assert.equal(merkleRoot(pkgs.map(leafFor)), merkleRoot([...pkgs].reverse().map(leafFor)));
    const chain: LedgerCheckpoint[] = [];
    const cp0 = appendCheckpoint(chain, pkgs);
    chain.push(cp0);
    const cp1 = appendCheckpoint(chain, pkgs.slice(0, 2));
    chain.push(cp1);
    assert.equal(cp1.prevRoot, cp0.root);
    assert.deepEqual(verifyLedger(chain), { ok: true });
    const bad = JSON.parse(JSON.stringify(chain));
    bad[1].leaves[0].leaf = '00'.repeat(32);
    assert.equal(verifyLedger(bad).ok, false);
    assert.equal(verifyLedger(bad).badSeq, 1);
  });
});

describe('ledger: inclusion proofs', () => {
  it('every station proves; foreign leaf fails', () => {
    const pkgs = [pkg('S1', 5), pkg('S2', 7), pkg('S3', 9), pkg('S4', 11), pkg('S5', 13)];
    const cp = appendCheckpoint([], pkgs);
    for (const p of pkgs) {
      const proof = inclusionProof(cp, p.polling_station);
      assert.ok(proof, p.polling_station);
      assert.equal(verifyProof(proof.leaf, proof.siblings, cp.root), true);
    }
    assert.equal(inclusionProof(cp, 'NOPE'), undefined);
    const proof = inclusionProof(cp, 'S1');
    assert.ok(proof);
    assert.equal(verifyProof('ff'.repeat(32), proof.siblings, cp.root), false);
  });
});
