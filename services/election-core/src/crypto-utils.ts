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
  return sha256Hex(`receipt:${ballotId}`).slice(0, 8).toUpperCase().replace(/(.{4})(.{4})/, '$1-$2');
}
