import { createHash, randomBytes } from 'node:crypto';

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Canonical JSON: sorted keys, recursive — used for hashing/signing. */
export function canonical(o: unknown): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(canonical).join(',')}]`;
  const keys = Object.keys(o as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((o as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

/** Participation receipt: proves inclusion, NOT choice (anti-coercion). */
export function participationReceipt(ballotId: string): string {
  return formatReceiptCode(sha256Hex(`receipt:${ballotId}`));
}

/**
 * Commitment-bound receipt (A5): the booth commits to C = sha256(ballotId:blinding)
 * in the ballot row and hands the voter (code, blinding). Anyone holding the
 * store sees only random-looking C values — unlike the legacy deterministic
 * code, C is NOT recomputable from ballotId alone, so a leaked store does not
 * turn a voter's code into a ballot lookup. Choice stays out of every proof.
 */
export function randomBlinding(bytes = 16): string {
  return randomToken(bytes);
}

export function ballotCommitment(ballotId: string, blinding: string): string {
  return sha256Hex(`${ballotId}:${blinding}`);
}

export function receiptFromCommitment(commitment: string): string {
  return formatReceiptCode(commitment);
}

function formatReceiptCode(hashHex: string): string {
  return hashHex.slice(0, 8).toUpperCase().replace(/(.{4})(.{4})/, '$1-$2');
}
