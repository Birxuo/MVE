// Citizen self-lookup — the ONE sanctioned identity-store reader outside ops.
// Returns district/station/eligibility ONLY: no choices, no tokens, no other
// voters, no CIN handling. Rate-limiting and production identification policy
// are out of scope here (see docs/elections/citizen-intake.md).
import { loadElection, loadVoters } from '../../election-core/src/store.js';

export interface RegistrationInfo {
  registered: true; district: string; station: string; stationName: string; eligible: boolean;
}

export function lookupRegistration(root: string, reference: string): RegistrationInfo | undefined {
  const ref = reference.trim();
  if (!ref || ref.length > 120) return undefined;
  const v = loadVoters(root).find((x) => x.voterId === ref);
  if (!v) return undefined;
  const st = loadElection(root).stations.find((s) => s.id === v.stationId);
  return {
    registered: true, district: v.districtId, station: v.stationId,
    stationName: st?.name ?? v.stationId, eligible: v.eligible,
  };
}
