import type { ResultPackage } from '../../election-core/src/types.js';

/** Public transparency view — sanitized, no PII, no individual choices. */
export interface PublicStationResult {
  station: string; device: string; counted: number; invalid: number;
  results: Record<string, number>; result_hash: string; signature: string;
  audit: 'PENDING' | 'PASSED' | 'ESCALATED';
}

export function toPublic(pkgs: ResultPackage[], audits: Map<string, string>): PublicStationResult[] {
  return pkgs.map((p) => ({
    station: p.polling_station, device: p.device,
    counted: p.ballots_counted, invalid: p.invalid_ballots,
    results: p.results,
    result_hash: p.result_hash ?? '', signature: p.signature ?? '',
    audit: (audits.get(p.polling_station) as PublicStationResult['audit']) ?? 'PENDING',
  }));
}

export function toCSV(rows: PublicStationResult[]): string {
  const choices = [...new Set(rows.flatMap((r) => Object.keys(r.results)))].sort();
  const header = ['station', 'device', 'counted', 'invalid', ...choices, 'result_hash', 'audit'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.station, r.device, r.counted, r.invalid,
      ...choices.map((c) => r.results[c] ?? 0), r.result_hash.slice(0, 12) + '...', r.audit].join(','));
  }
  return lines.join('\n');
}

/** CSV-escape one field (quotes, commas, newlines). */
export function csvField(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full-fidelity dataset CSV (complete hashes/signatures + every hash input field)
 * for independent reproduction (§42). A third party can rebuild each canonical
 * package body from a row and recompute result_hash without trusting this repo. */
export function toDatasetCSV(pkgs: ResultPackage[], audits: Map<string, string>): string {
  const choices = [...new Set(pkgs.flatMap((p) => Object.keys(p.results)))].sort();
  const header = ['election', 'station', 'device', 'ballots_issued', 'counted', 'invalid',
    ...choices, 'timestamp', 'firmware_hash', 'result_hash', 'signature', 'audit'];
  const lines = [header.join(',')];
  for (const p of pkgs) {
    lines.push([p.election, p.polling_station, p.device, p.ballots_issued, p.ballots_counted,
      p.invalid_ballots, ...choices.map((c) => p.results[c] ?? 0),
      p.timestamp, p.firmware_hash, p.result_hash ?? '', p.signature ?? '',
      audits.get(p.polling_station) ?? 'PENDING']
      .map(csvField).join(','));
  }
  return lines.join('\n');
}
