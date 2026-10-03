// 2-of-n Shamir secret sharing over GF(256) — zero deps, research prototype.
// Splits arbitrary byte strings (e.g. a CA private-key PEM) so any `threshold`
// shares reconstruct, fewer reveal nothing. Addition in GF(256) is XOR;
// multiplication reduces by the AES polynomial x^8+x^4+x^3+x+1 (0x11b).
// Share indices are non-zero field elements (1..255); this file uses 1..total.
import { randomBytes } from 'node:crypto';

export interface KeyShare {
  /** Share index = evaluation point x (1-based, never 0). */
  index: number;
  /** Share payload, hex-encoded (same length as the secret). */
  dataHex: string;
}

function gfMul(a: number, b: number): number {
  let p = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  while (y) {
    if (y & 1) p ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11b;
    y >>>= 1;
  }
  return p & 0xff;
}

function gfPow(a: number, e: number): number {
  let r = 1;
  let base = a & 0xff;
  let exp = e;
  while (exp) {
    if (exp & 1) r = gfMul(r, base);
    base = gfMul(base, base);
    exp >>>= 1;
  }
  return r;
}

function gfInv(a: number): number {
  if (a === 0) throw new Error('GF(256): division by zero');
  // a^255 = 1 for a != 0, so a^-1 = a^254.
  return gfPow(a, 254);
}

/** Split `secret` into `total` shares with reconstruction `threshold` (default 2-of-3). */
export function splitSecret(secret: Buffer, threshold = 2, total = 3): KeyShare[] {
  if (!Number.isInteger(threshold) || !Number.isInteger(total)) throw new Error('threshold/total must be integers');
  if (threshold < 2) throw new Error('threshold must be >= 2 (single-share mode is refused)');
  if (total < threshold) throw new Error('total must be >= threshold');
  if (total > 255) throw new Error('total must be <= 255');
  if (secret.length === 0) throw new Error('cannot split an empty secret');
  // Random coefficients for x^1 .. x^(threshold-1), per byte position.
  const coeffs: Buffer[] = [];
  for (let d = 1; d < threshold; d++) coeffs.push(randomBytes(secret.length));
  const shares: KeyShare[] = [];
  for (let x = 1; x <= total; x++) {
    const out = Buffer.alloc(secret.length);
    for (let i = 0; i < secret.length; i++) {
      // Horner: y = secret + c1*x + c2*x^2 + ... evaluated at x.
      let y = secret[i];
      let xp = 1;
      for (const c of coeffs) {
        xp = gfMul(xp, x);
        y ^= gfMul(c[i], xp);
      }
      out[i] = y;
    }
    shares.push({ index: x, dataHex: out.toString('hex') });
  }
  return shares;
}

/** Reconstruct the secret from >= threshold shares (any subset). Throws on too few / bad input. */
export function combineShares(shares: KeyShare[], threshold = 2): Buffer {
  if (shares.length < threshold) {
    throw new Error(`need >= ${threshold} shares to reconstruct (got ${shares.length})`);
  }
  const use = shares.slice(0, threshold);
  const seen = new Set<number>();
  for (const s of use) {
    if (!Number.isInteger(s.index) || s.index < 1 || s.index > 255) throw new Error(`bad share index ${s.index}`);
    if (seen.has(s.index)) throw new Error(`duplicate share index ${s.index}`);
    seen.add(s.index);
  }
  const bufs = use.map((s) => {
    if (typeof s.dataHex !== 'string' || s.dataHex.length % 2 !== 0) throw new Error(`bad share data for index ${s.index}`);
    return Buffer.from(s.dataHex, 'hex');
  });
  const len = bufs[0].length;
  if (bufs.some((b) => b.length !== len)) throw new Error('share length mismatch');
  // Lagrange basis at x=0: L_j = prod_{m != j} x_m / (x_m - x_j).
  // In characteristic 2, subtraction = addition = XOR.
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    let acc = 0;
    for (let j = 0; j < use.length; j++) {
      let num = 1;
      let den = 1;
      for (let m = 0; m < use.length; m++) {
        if (m === j) continue;
        num = gfMul(num, use[m].index);
        den = gfMul(den, use[m].index ^ use[j].index);
      }
      acc ^= gfMul(bufs[j][i], gfMul(num, gfInv(den)));
    }
    out[i] = acc;
  }
  return out;
}

/** Share-file envelope written by `manage ceremony` (JSON, one file per custodian). */
export interface ShareFile {
  version: 1;
  shareIndex: number;
  threshold: number;
  total: number;
  custodians: string[];
  observer: string;
  imageHash: string;
  rootPubPem: string;
  createdAt: string;
  dataHex: string;
}

export function toShareFile(
  share: KeyShare, meta: { threshold: number; total: number; custodians: string[]; observer: string; imageHash: string; rootPubPem: string; createdAt: string },
): ShareFile {
  return {
    version: 1, shareIndex: share.index, threshold: meta.threshold, total: meta.total,
    custodians: meta.custodians, observer: meta.observer, imageHash: meta.imageHash,
    rootPubPem: meta.rootPubPem, createdAt: meta.createdAt, dataHex: share.dataHex,
  };
}

export function shareFileToKeyShare(f: ShareFile): KeyShare {
  if (f?.version !== 1 || !Number.isInteger(f.shareIndex)) throw new Error('bad share file (version/shareIndex)');
  return { index: f.shareIndex, dataHex: f.dataHex };
}
