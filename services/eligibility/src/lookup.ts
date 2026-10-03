// Citizen self-lookup — the ONE sanctioned identity-store reader outside ops.
// Returns district/station/eligibility ONLY: no choices, no tokens, no other
// voters, no CIN handling (references are registration card IDs, never CINs —
// see docs/elections/citizen-intake.md). Abuse throttling lives in the HTTP
// layer (public-portal rate limit); this module stays pure.
import { loadElection, loadVoters } from '../../election-core/src/store.js';

export interface RegistrationInfo {
  registered: true; district: string; station: string; stationName: string; eligible: boolean;
}

/** Reference allowlist: card IDs only (1..64 of letters/digits/._-). */
const REFERENCE_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function isLookupReferenceValid(reference: string): boolean {
  return REFERENCE_RE.test(reference.trim());
}

export function lookupRegistration(root: string, reference: string): RegistrationInfo | undefined {
  const ref = reference.trim();
  if (!isLookupReferenceValid(ref)) return undefined;
  const v = loadVoters(root).find((x) => x.voterId === ref);
  if (!v) return undefined;
  const st = loadElection(root).stations.find((s) => s.id === v.stationId);
  return {
    registered: true, district: v.districtId, station: v.stationId,
    stationName: st?.name ?? v.stationId, eligible: v.eligible,
  };
}
