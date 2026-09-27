// Election core types — mirrors docs/architecture/election-core.md
export type ElectionStatus = 'draft' | 'open' | 'closed' | 'audited';
export type StationStatus = 'closed' | 'open';

export interface Election { id: string; name: string; date: string; status: ElectionStatus; }
export interface District { id: string; electionId: string; name: string; seats: number; }
export interface PollingStation {
  id: string; districtId: string; name: string;
  registeredVoters: number; status: StationStatus;
  deviceId: string; firmwareHash: string;
}
export interface Candidate { id: string; electionId: string; name: string; party: string; }
export interface Officer { id: string; stationId: string; role: 'presiding' | 'deputy' | 'observer'; pubkeyPem?: string; }

// Identity domain — NEVER holds choices (see docs/architecture/database.md)
export interface Voter { voterId: string; districtId: string; stationId: string; eligible: boolean; status: 'NOT_VOTED' | 'VOTED'; }

// Ballot domain — NO voterId column by design
export interface Ballot { ballotId: string; tokenHash: string; stationId: string; choiceId: string; ts: string; }

export interface ResultPackage {
  election: string; polling_station: string; device: string;
  ballots_issued: number; ballots_counted: number; invalid_ballots: number;
  results: Record<string, number>;
  timestamp: string; firmware_hash: string;
  result_hash?: string; signature?: string;
}

export interface AuditEvent {
  seq: number; ts: string; type: string; stationId: string; deviceId: string;
  payload: Record<string, unknown>; prevHash: string; hash: string; signature?: string;
}
