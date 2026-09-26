import type { AuditEvent } from '../../election-core/src/types.js';
import { canonical, sha256Hex } from '../../election-core/src/crypto-utils.js';

export class AuditLog {
  private events: AuditEvent[] = [];
  private prevHash = 'GENESIS';

  append(type: string, stationId: string, deviceId: string, payload: Record<string, unknown> = {}): AuditEvent {
    const seq = this.events.length;
    const ts = new Date().toISOString();
    const hash = sha256Hex(this.prevHash + '|' + canonical({ seq, ts, type, stationId, deviceId, payload }));
    const ev: AuditEvent = { seq, ts, type, stationId, deviceId, payload, prevHash: this.prevHash, hash };
    this.events.push(ev);
    this.prevHash = hash;
    return ev;
  }

  verifyChain(): { ok: boolean; badSeq?: number } {
    let prev = 'GENESIS';
    for (const e of this.events) {
      const recomputed = sha256Hex(prev + '|' + canonical({
        seq: e.seq, ts: e.ts, type: e.type, stationId: e.stationId, deviceId: e.deviceId, payload: e.payload,
      }));
      if (recomputed !== e.hash || e.prevHash !== prev) return { ok: false, badSeq: e.seq };
      prev = e.hash;
    }
    return { ok: true };
  }

  all(): AuditEvent[] { return [...this.events]; }
}

/** Reconciliation: authorized vs electronic vs paper. Returns exception on mismatch. */
export function reconcile(a: { authorized: number; electronic: number; paper: number; invalid?: number }):
  { ok: boolean; detail: string } {
  const { authorized, electronic, paper } = a;
  if (electronic !== paper) {
    return { ok: false, detail: `EXCEPTION: electronic=${electronic} != paper=${paper}` };
  }
  if (authorized < electronic) {
    return { ok: false, detail: `EXCEPTION: authorized=${authorized} < electronic=${electronic}` };
  }
  return { ok: true, detail: `OK: authorized=${authorized} electronic=${electronic} paper=${paper}` };
}

/** Seeded RNG (mulberry32) for reproducible RLA sampling. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), t | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random station sample for risk-limiting audit. */
export function sampleStations(stationIds: string[], n: number, seed = 20260923): string[] {
  const rand = mulberry32(seed);
  const pool = [...stationIds];
  const out: string[] = [];
  while (out.length < Math.min(n, pool.length)) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out.sort();
}

/** Flag anomalies (turnout etc.) for HUMAN review — never auto-fraud. */
export function flagAnomalies(stations: { id: string; turnoutPct: number; invalidPct: number }[]):
  { id: string; reason: string }[] {
  const flags: { id: string; reason: string }[] = [];
  for (const s of stations) {
    if (s.turnoutPct > 95) flags.push({ id: s.id, reason: `turnout ${s.turnoutPct}% — investigate` });
    if (s.invalidPct > 5) flags.push({ id: s.id, reason: `invalid ${s.invalidPct}% — investigate` });
  }
  return flags;
}
