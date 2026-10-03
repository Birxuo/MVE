// Transparency ledger — append-only Merkle-chained public log.
// Leaves are result-package hashes ONLY (no votes, no identities).
// Checkpoints chain like the audit log: each checkpoint commits {root, prevRoot}.
// Anyone holding a checkpoint root can verify inclusion proofs independently.
import { sha256Hex, canonical } from '../../election-core/src/crypto-utils.js';
import type { ResultPackage } from '../../election-core/src/types.js';

export interface LedgerCheckpoint {
  seq: number; ts: string; leaves: { station: string; leaf: string }[];
  root: string; prevRoot: string;
}

export function leafFor(pkg: ResultPackage): string {
  const { result_hash, signature, ...body } = pkg;
  void result_hash;
  void signature;
  return sha256Hex(canonical(body));
}

/** Merkle root over sorted leaves; odd nodes promote (deterministic, documented). */
export function merkleRoot(leaves: string[]): string {
  if (!leaves.length) return sha256Hex('mve-empty-ledger');
  const sorted = [...leaves].sort();
  let level = sorted;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha256Hex(level[i] + level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/** Append a checkpoint over the given packages (sorted by station). */
export function appendCheckpoint(prev: LedgerCheckpoint[], pkgs: ResultPackage[]): LedgerCheckpoint {
  const sorted = [...pkgs].sort((a, b) => a.polling_station.localeCompare(b.polling_station));
  const leaves = sorted.map((p) => ({ station: p.polling_station, leaf: leafFor(p) }));
  return {
    seq: prev.length,
    ts: new Date().toISOString(),
    leaves,
    root: merkleRoot(leaves.map((l) => l.leaf)),
    prevRoot: prev.length ? prev[prev.length - 1].root : 'GENESIS',
  };
}

/** Inclusion proof: sibling hashes from leaf to root. */
export function inclusionProof(checkpoint: LedgerCheckpoint, station: string):
  { leaf: string; siblings: { hash: string; left: boolean }[] } | undefined {
  const leaves = [...checkpoint.leaves].sort((a, b) => a.leaf.localeCompare(b.leaf));
  const idx = leaves.findIndex((l) => l.station === station);
  if (idx === -1) return undefined;
  const siblings: { hash: string; left: boolean }[] = [];
  let level = leaves.map((l) => l.leaf);
  let i = idx;
  while (level.length > 1) {
    const next: string[] = [];
    for (let j = 0; j < level.length; j += 2) {
      if (j + 1 < level.length) {
        next.push(sha256Hex(level[j] + level[j + 1]));
        if (j === i || j + 1 === i) {
          siblings.push(j === i
            ? { hash: level[j + 1], left: false }
            : { hash: level[j], left: true });
        }
      } else {
        next.push(level[j]);
      }
    }
    // Map index to next level: pairs collapse; promoted odd keeps position.
    i = Math.floor(i / 2);
    level = next;
  }
  return { leaf: leaves[idx].leaf, siblings };
}

export function verifyProof(leaf: string, siblings: { hash: string; left: boolean }[], root: string): boolean {
  let h = leaf;
  for (const s of siblings) {
    h = s.left ? sha256Hex(s.hash + h) : sha256Hex(h + s.hash);
  }
  return h === root;
}

/** Full re-verification of a checkpoint chain (roots + links). */
export function verifyLedger(chain: LedgerCheckpoint[]): { ok: boolean; badSeq?: number } {
  let prevRoot = 'GENESIS';
  for (const cp of chain) {
    if (cp.prevRoot !== prevRoot) return { ok: false, badSeq: cp.seq };
    if (cp.root !== merkleRoot(cp.leaves.map((l) => l.leaf))) return { ok: false, badSeq: cp.seq };
    prevRoot = cp.root;
  }
  return { ok: true };
}
