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
