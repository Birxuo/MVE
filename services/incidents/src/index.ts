// Incident service core — structured reporting workflow.
// Reports NEVER auto-change results: open → triaged → investigating → resolved|dismissed.
// Source: README.md Incident Reporting.

export const INCIDENT_CATEGORIES = [
  'voting-equipment',
  'ballot-issue',
  'counting-discrepancy',
  'unauthorized-access',
  'intimidation',
  'procedural-violation',
  'accessibility-issue',
  'network-failure',
  'power-failure',
  'other',
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentStatus = 'open' | 'triaged' | 'investigating' | 'resolved' | 'dismissed';

export interface StatusChange { ts: string; from: IncidentStatus; to: IncidentStatus; note: string; }

export interface Incident {
  id: string; stationId: string; ts: string;
  category: IncidentCategory; description: string; reporter: string;
  status: IncidentStatus; history: StatusChange[]; evidenceRefs: string[];
  /** Accreditation stub: true only when observerId matches a registered
   * station observer (see resolveAccreditation). Unauthenticated reports land
   * accredited:false and stay fully usable — they are flagged UNVERIFIED, never
   * dropped. Added in B3; absent on older records = false. */
  accredited: boolean; observerId?: string;
}

export function isCategory(c: string): c is IncidentCategory {
  return (INCIDENT_CATEGORIES as readonly string[]).includes(c);
}

function nextId(existing: Incident[]): string {
  return `INC-${String(existing.length + 1).padStart(4, '0')}`;
}

/** Create a new incident in `open`. Throws on invalid category/empty fields. */
export function createIncident(
  list: Incident[],
  input: { stationId: string; category: string; description: string; reporter?: string; evidenceRefs?: string[]; observerId?: string; accredited?: boolean },
): Incident {
  const stationId = input.stationId.trim();
  if (!stationId) throw new Error('stationId required');
  if (!isCategory(input.category)) {
    throw new Error(`invalid category ${input.category} (see INCIDENT_CATEGORIES)`);
  }
  const description = input.description.trim();
  if (!description) throw new Error('description required');
  if (description.length > 2000) throw new Error('description too long (max 2000)');
  const now = new Date().toISOString();
  const inc: Incident = {
    id: nextId(list),
    stationId, ts: now, category: input.category, description,
    reporter: (input.reporter ?? 'anonymous').slice(0, 120),
    status: 'open',
    history: [{ ts: now, from: 'open', to: 'open', note: 'reported' }],
    evidenceRefs: input.evidenceRefs ?? [],
    accredited: input.accredited ?? false,
  };
  if (input.observerId) inc.observerId = input.observerId.slice(0, 120);
  list.push(inc);
  return inc;
}

/**
 * Accreditation stub: an observerId is accredited only if it matches a
 * registered `observer`-role officer FOR THAT STATION. Anything else —
 * unknown id, wrong station, wrong role, or no id at all — resolves to
 * accredited:false (report still accepted, flagged UNVERIFIED downstream).
 */
export function resolveAccreditation(
  officers: { id: string; stationId: string; role: string }[],
  stationId: string, observerId?: string,
): { accredited: boolean; observerId?: string } {
  const id = (observerId ?? '').trim().slice(0, 120);
  if (!id) return { accredited: false };
  const ok = officers.some((o) => o.id === id && o.stationId === stationId && o.role === 'observer');
  return ok ? { accredited: true, observerId: id } : { accredited: false };
}

/** Redaction patterns for text evidence: likely personal identifiers. */
const SENSITIVE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'CIN-like code', re: /\b[A-Z]{1,2}[-\s]?\d{6,8}\b/ },
  { name: 'long digit run', re: /\b\d{10,}\b/ },
  { name: 'CIN keyword', re: /\bCIN\b/i },
];

/**
 * Scan decoded text evidence for personal identifiers. Returns one finding
 * per hit pattern (empty = clean). Binary evidence (images/PDF) cannot be
 * scanned here — callers must report it as unscanned, never as clean.
 */
export function scanEvidenceText(name: string, text: string): string[] {
  const hits: string[] = [];
  for (const p of SENSITIVE_PATTERNS) {
    if (p.re.test(text)) hits.push(`${name}: possible ${p.name} — redact before submitting`);
  }
  return hits;
}

function transition(list: Incident[], id: string, to: IncidentStatus, note: string, allowedFrom: IncidentStatus[]): Incident {
  const inc = list.find((x) => x.id === id);
  if (!inc) throw new Error(`unknown incident ${id}`);
  if (!allowedFrom.includes(inc.status)) {
    throw new Error(`${id}: cannot move ${inc.status} → ${to}`);
  }
  const ts = new Date().toISOString();
  inc.history.push({ ts, from: inc.status, to, note: note.slice(0, 500) });
  inc.status = to;
  return inc;
}

/** Human triage: open|triaged → investigating|dismissed. */
export function triageIncident(list: Incident[], id: string, decision: 'investigating' | 'dismissed', note: string): Incident {
  if (!note.trim()) throw new Error('triage note required');
  return transition(list, id, decision, note, ['open', 'triaged']);
}

/** Resolve: investigating|triaged → resolved. */
export function resolveIncident(list: Incident[], id: string, note: string): Incident {
  if (!note.trim()) throw new Error('resolution note required');
  return transition(list, id, 'resolved', note, ['investigating', 'triaged']);
}

/** Reopen a terminal incident back to triaged for further review. */
export function reopenIncident(list: Incident[], id: string, note: string): Incident {
  if (!note.trim()) throw new Error('reopen note required');
  return transition(list, id, 'triaged', note, ['dismissed', 'resolved']);
}

/**
 * Bridge anomaly flags → triaged incidents (flag ≠ fraud; human review required).
 * Each flag becomes one incident with reporter `system:anomaly-detector`.
 * Skips stations that already have a non-terminal incident with the same description.
 */
export function incidentsFromFlags(
  list: Incident[],
  flags: { id: string; reason: string }[],
): Incident[] {
  const created: Incident[] = [];
  for (const f of flags) {
    const dup = list.some(
      (x) => x.stationId === f.id && x.description === f.reason && x.status !== 'resolved' && x.status !== 'dismissed',
    );
    if (dup) continue;
    const inc = createIncident(list, {
      stationId: f.id, category: 'procedural-violation', description: f.reason, reporter: 'system:anomaly-detector',
    });
    // Auto-opened by detector → mark triaged (seen), still needs human investigating/resolve.
    transition(list, inc.id, 'triaged', 'auto-triaged from anomaly flag; needs human review', ['open']);
    created.push(inc);
  }
  return created;
}

/** Observer-safe summary: counts only, no voter data (incidents carry metadata only). */
export function summarize(list: Incident[]): Record<IncidentStatus, number> {
  const out: Record<IncidentStatus, number> = { open: 0, triaged: 0, investigating: 0, resolved: 0, dismissed: 0 };
  for (const x of list) out[x.status]++;
  return out;
}
