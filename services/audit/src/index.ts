import type { AuditEvent } from '../../election-core/src/types.js';
import { canonical, sha256Hex } from '../../election-core/src/crypto-utils.js';
import { loadRlaCeremony } from '../../election-core/src/store.js';
import { createPublicKey, sign, verify, createPrivateKey } from 'node:crypto';

export type EventSigner = (hashHex: string, deviceId: string) => string | undefined;

function eventBody(e: { seq: number; ts: string; type: string; stationId: string; deviceId: string; payload: Record<string, unknown> }): string {
  return canonical({
    seq: e.seq, ts: e.ts, type: e.type, stationId: e.stationId, deviceId: e.deviceId, payload: e.payload,
  });
}

export class AuditLog {
  private events: AuditEvent[] = [];
  private prevHash: string;
  private baseSeq: number;

  constructor(private signer?: EventSigner, startSeq = 0, startPrevHash = 'GENESIS') {
    this.baseSeq = startSeq;
    this.prevHash = startPrevHash;
  }

  append(type: string, stationId: string, deviceId: string, payload: Record<string, unknown> = {}): AuditEvent {
    const seq = this.baseSeq + this.events.length;
    const ts = new Date().toISOString();
    const hash = sha256Hex(this.prevHash + '|' + eventBody({ seq, ts, type, stationId, deviceId, payload }));
    const ev: AuditEvent = { seq, ts, type, stationId, deviceId, payload, prevHash: this.prevHash, hash };
    const sig = this.signer?.(hash, deviceId);
    if (sig) ev.signature = sig;
    this.events.push(ev);
    this.prevHash = hash;
    return ev;
  }

  verifyChain(verifiers?: Map<string, string>): { ok: boolean; badSeq?: number } {
    return verifyEventChain(this.events, verifiers);
  }

  all(): AuditEvent[] { return [...this.events]; }

  /** Chain tip for resuming across flush windows (streaming runs). */
  tip(): { nextSeq: number; prevHash: string } {
    return { nextSeq: this.baseSeq + this.events.length, prevHash: this.prevHash };
  }

  /** Independent replica: deep copy for off-site storage; verifies on restore. */
  fork(): AuditEvent[] {
    return JSON.parse(JSON.stringify(this.events)) as AuditEvent[];
  }
}

/** Sign one event hash with a device Ed25519 private key (PEM). */
export function signEvent(hashHex: string, privateKeyPem: string): string {
  return sign(null, Buffer.from(hashHex, 'hex'), createPrivateKey(privateKeyPem)).toString('hex');
}

/**
 * Verify a chain: hashes + links always; signatures when present AND a verifier
 * key is supplied. Unsigned events verify on hash-chain alone (legacy/file path).
 */
export function verifyEventChain(
  events: AuditEvent[], verifiers?: Map<string, string>,
): { ok: boolean; badSeq?: number } {
  let prev = 'GENESIS';
  for (const e of events) {
    const recomputed = sha256Hex(prev + '|' + eventBody(e));
    if (recomputed !== e.hash || e.prevHash !== prev) return { ok: false, badSeq: e.seq };
    if (e.signature && verifiers?.has(e.deviceId)) {
      try {
        const ok = verify(
          null, Buffer.from(e.hash, 'hex'),
          createPublicKey(verifiers.get(e.deviceId) as string),
          Buffer.from(e.signature, 'hex'),
        );
        if (!ok) return { ok: false, badSeq: e.seq };
      } catch {
        return { ok: false, badSeq: e.seq };
      }
    }
    prev = e.hash;
  }
  return { ok: true };
}

/**
 * Coverage report: which events carry a verifiable signature and which do not.
 * Unsigned = hash-chained only (legacy or key-unavailable path); invalid = a
 * signature is present but does not verify against the supplied keys (wrong key,
 * unknown device, or tampered content). Powers `transparency audit-verify --strict`.
 */
export function auditCoverage(
  events: AuditEvent[], verifiers?: Map<string, string>,
): { total: number; signed: number; unsigned: number[]; invalid: number[] } {
  const unsigned: number[] = [];
  const invalid: number[] = [];
  let signed = 0;
  for (const e of events) {
    if (!e.signature) {
      unsigned.push(e.seq);
      continue;
    }
    signed++;
    const pub = verifiers?.get(e.deviceId);
    let ok = false;
    if (pub) {
      try {
        ok = verify(
          null, Buffer.from(e.hash, 'hex'),
          createPublicKey(pub), Buffer.from(e.signature, 'hex'),
        );
      } catch { ok = false; }
    }
    if (!ok) invalid.push(e.seq);
  }
  return { total: events.length, signed, unsigned, invalid };
}

/**
 * Reconciliation: the closing accounting identity.
 *   registered = authorized + unused          (unused: never showed up)
 *   authorized = electronic + abandoned        (abandoned: left without casting — tolerated)
 *   electronic = paper                        (EXACT — every electronic ballot needs its slip)
 *   invalid ≤ electronic                       (spoiled/adjudicated slips, subset of electronic)
 * Any impossible state returns EXCEPTION and the caller must refuse to sign.
 */
export function reconcile(a: {
  authorized: number; electronic: number; paper: number;
  registered?: number; invalid?: number;
}):
  { ok: boolean; detail: string } {
  const { authorized, electronic, paper, invalid = 0 } = a;
  if (electronic !== paper) {
    return { ok: false, detail: `EXCEPTION: electronic=${electronic} != paper=${paper}` };
  }
  if (authorized < electronic) {
    return { ok: false, detail: `EXCEPTION: authorized=${authorized} < electronic=${electronic}` };
  }
  if (a.registered !== undefined && authorized > a.registered) {
    return { ok: false, detail: `EXCEPTION: authorized=${authorized} > registered=${a.registered}` };
  }
  if (invalid < 0 || invalid > electronic) {
    return { ok: false, detail: `EXCEPTION: invalid=${invalid} outside 0..electronic=${electronic}` };
  }
  const unused = a.registered !== undefined ? a.registered - authorized : -1;
  const abandoned = authorized - electronic;
  return {
    ok: true,
    detail: `OK: registered=${a.registered ?? '?'} authorized=${authorized}` +
      `${unused >= 0 ? ` unused=${unused}` : ''} abandoned=${abandoned}` +
      ` electronic=${electronic} paper=${paper} invalid=${invalid}`,
  };
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

/**
 * Public-randomness seed: the ceremony input (hex published BEFORE election day,
 * e.g. dice rolls witnessed by observers) binds the sample. Anyone holding the
 * published hex reproduces the exact sample — no selective auditing possible.
 */
export function seedFromCeremony(ceremonyHex: string): number {
  const clean = ceremonyHex.trim().toLowerCase();
  if (!/^[0-9a-f]{16,}$/.test(clean)) {
    throw new Error('ceremony input must be ≥16 hex chars, published before election day');
  }
  const digest = sha256Hex(`rla-ceremony:${clean}`);
  return parseInt(digest.slice(0, 8), 16) >>> 0;
}

/**
 * Pre-committed sample table (research-grade, NOT a calibrated RLA risk limit).
 * Committed before the election; auditors look up the row, never negotiate size.
 * Covered stations → initial sample → mismatches allowed before escalation.
 */
export const SAMPLE_TABLE = [
  { maxStations: 10, sample: 2, allowed: 0 },
  { maxStations: 50, sample: 5, allowed: 0 },
  { maxStations: 200, sample: 20, allowed: 1 },
  { maxStations: 1000, sample: 50, allowed: 1 },
  { maxStations: Number.POSITIVE_INFINITY, sample: 100, allowed: 2 },
] as const;

export function sampleSizeFor(stationCount: number): { sample: number; allowed: number } {
  const row = SAMPLE_TABLE.find((r) => stationCount <= r.maxStations) ?? SAMPLE_TABLE[SAMPLE_TABLE.length - 1];
  return { sample: Math.min(row.sample, Math.max(stationCount, 1)), allowed: row.allowed };
}

export type RlaVerdict = 'PASS' | 'ESCALATE' | 'FULL_RECOUNT';
/**
 * Adjudicate a hand-counted sample. Human decision, never AI:
 * clean → PASS; within tolerance → ESCALATE (expand sample ×3); beyond → FULL_RECOUNT.
 */
export function adjudicateSample(
  stationCount: number, checked: { station: string; match: boolean }[],
): { mismatches: number; verdict: RlaVerdict; nextSample: number } {
  const { sample, allowed } = sampleSizeFor(stationCount);
  const mismatches = checked.filter((c) => !c.match).length;
  if (mismatches === 0) return { mismatches, verdict: 'PASS', nextSample: sample };
  if (mismatches <= allowed) {
    return { mismatches, verdict: 'ESCALATE', nextSample: Math.min(stationCount, sample * 3) };
  }
  return { mismatches, verdict: 'FULL_RECOUNT', nextSample: stationCount };
}

export interface RlaSampleConfig {
  stations: string[]; sampleSize: number; seed: number;
  ceremonyHex: string | null; manual: boolean;
}

/**
 * Resolve the audit sample with ceremony binding (no post-hoc negotiation):
 * size comes from `--sample N|auto` (auto = pre-committed table row), the seed
 * from `--ceremony HEX`, else the recorded `audit/rla-ceremony.json`, else a
 * manual `--seed` flagged demo-only. Returns null when sampling is off.
 */
export function resolveRlaSample(
  root: string, stationIds: string[],
  opts: { sample: string; ceremony?: string; seed?: string },
): RlaSampleConfig | null {
  const raw = (opts.sample ?? '0').trim().toLowerCase();
  if (!raw || raw === '0' || raw === 'off') return null;
  const size = raw === 'auto'
    ? sampleSizeFor(stationIds.length).sample
    : Number(raw);
  if (!Number.isInteger(size) || size <= 0) throw new Error(`bad --sample ${opts.sample} (want N>0 or auto)`);
  const clean = (opts.ceremony ?? '').trim().toLowerCase();
  const recorded = clean ? undefined : loadRlaCeremony(root);
  const ceremonyHex = clean || recorded?.hex || null;
  if (ceremonyHex) {
    const seed = seedFromCeremony(ceremonyHex); // throws on malformed hex
    return { stations: sampleStations(stationIds, size, seed), sampleSize: size, seed, ceremonyHex, manual: false };
  }
  const seed = Number(opts.seed ?? '20260923');
  if (!Number.isFinite(seed)) throw new Error(`bad --seed ${opts.seed}`);
  return { stations: sampleStations(stationIds, size, seed), sampleSize: size, seed, ceremonyHex: null, manual: true };
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

export interface StationTelemetry {
  id: string;
  turnoutPct: number;
  invalidPct: number;
  /** minutes between POLL_OPENED and POLL_CLOSED */
  openMinutes: number;
  /** minutes between POLL_CLOSED and RESULT_SIGNED (transmission delay) */
  resultDelayMinutes: number;
  /** RESULT_EXCEPTION / error events at this station */
  exceptionCount: number;
  /** extra POLL_OPENED events beyond the first (reopens) */
  reopenCount: number;
  /** paper↔electronic mismatch found by the verification check */
  recountMismatch: boolean;
}

/**
 * Multi-signal anomaly analysis. Thresholds are research-grade tripwires, not
 * fraud verdicts — every flag routes to human triage via incidentsFromFlags.
 */
export function analyzeTelemetry(stations: StationTelemetry[]): { id: string; reason: string }[] {
  const flags = flagAnomalies(stations);
  if (!stations.length) return flags;
  const durations = stations.map((s) => s.openMinutes).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  for (const s of stations) {
    if (median > 0 && s.openMinutes > median * 2) {
      flags.push({ id: s.id, reason: `open ${s.openMinutes}min vs median ${median}min — investigate` });
    }
    if (s.openMinutes < 30 && s.turnoutPct > 50) {
      flags.push({ id: s.id, reason: `closed in ${s.openMinutes}min at ${s.turnoutPct}% turnout — investigate` });
    }
    if (s.resultDelayMinutes > 120) {
      flags.push({ id: s.id, reason: `result delay ${s.resultDelayMinutes}min — investigate` });
    }
    if (s.exceptionCount > 0) {
      flags.push({ id: s.id, reason: `${s.exceptionCount} exception event(s) — investigate` });
    }
    if (s.reopenCount > 0) {
      flags.push({ id: s.id, reason: `polls reopened ${s.reopenCount}x — investigate` });
    }
    if (s.recountMismatch) {
      flags.push({ id: s.id, reason: `paper↔electronic mismatch — investigate` });
    }
  }
  return flags;
}
