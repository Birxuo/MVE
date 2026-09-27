// File DB layer — 6 separated JSON stores under data/ (gitignored).
// Identity and ballot stores stay in separate files by design; no joins.
// Incidents carry metadata only (no choices, no voter IDs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AuditEvent, Ballot, Candidate, District, Election, Officer, PollingStation, ResultPackage, Voter,
} from './types.js';
import type { Incident } from '../../incidents/src/index.js';

export const DATA_ROOT = 'data';
export const STORES = {
  identity: 'identity/voters.json',
  election: 'election/election.json',
  voting: 'voting/ballots.json',
  audit: 'audit/events.json',
  transparency: 'transparency/results.json',
  incidents: 'incidents/incidents.json',
  ledger: 'transparency/ledger.json',
} as const;

export interface ElectionStore {
  elections: Election[]; districts: District[]; stations: PollingStation[];
  candidates: Candidate[]; officers: Officer[];
}

function pathFor(rel: string): string {
  return join(DATA_ROOT, rel);
}

export function ensureDataDirs(root = DATA_ROOT): void {
  for (const rel of Object.values(STORES)) {
    const dir = join(root, rel.split('/')[0]);
    mkdirSync(dir, { recursive: true });
  }
}

function readJson<T>(rel: string, fallback: T, root = DATA_ROOT): T {
  const p = join(root, rel);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(rel: string, value: unknown, root = DATA_ROOT): void {
  mkdirSync(join(root, rel.split('/')[0]), { recursive: true });
  writeFileSync(join(root, rel), JSON.stringify(value, null, 2) + '\n');
}

const EMPTY_ELECTION: ElectionStore = { elections: [], districts: [], stations: [], candidates: [], officers: [] };

export function loadElection(root = DATA_ROOT): ElectionStore {
  return readJson<ElectionStore>(STORES.election, EMPTY_ELECTION, root);
}

export function saveElection(s: ElectionStore, root = DATA_ROOT): void {
  writeJson(STORES.election, s, root);
}

export function loadVoters(root = DATA_ROOT): Voter[] {
  return readJson<Voter[]>(STORES.identity, [], root);
}

export function saveVoters(v: Voter[], root = DATA_ROOT): void {
  writeJson(STORES.identity, v, root);
}

export function loadBallots(root = DATA_ROOT): Ballot[] {
  return readJson<Ballot[]>(STORES.voting, [], root);
}

export function saveBallots(b: Ballot[], root = DATA_ROOT): void {
  writeJson(STORES.voting, b, root);
}

export function loadEvents(root = DATA_ROOT): AuditEvent[] {
  return readJson<AuditEvent[]>(STORES.audit, [], root);
}

export function saveEvents(e: AuditEvent[], root = DATA_ROOT): void {
  writeJson(STORES.audit, e, root);
}

export function loadResults(root = DATA_ROOT): ResultPackage[] {
  return readJson<ResultPackage[]>(STORES.transparency, [], root);
}

export function saveResults(r: ResultPackage[], root = DATA_ROOT): void {
  writeJson(STORES.transparency, r, root);
}

export function loadIncidents(root = DATA_ROOT): Incident[] {
  return readJson<Incident[]>(STORES.incidents, [], root);
}

export function saveIncidents(list: Incident[], root = DATA_ROOT): void {
  writeJson(STORES.incidents, list, root);
}

export function loadLedger<T = unknown>(root = DATA_ROOT): T[] {
  return readJson<T[]>(STORES.ledger, [], root);
}

export function saveLedger(chain: unknown, root = DATA_ROOT): void {
  writeJson(STORES.ledger, chain, root);
}
