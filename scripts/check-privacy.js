// Privacy guard: ballot domain must never reference voter identity;
// incident metadata must never carry vote content.
// Run: npm run lint:privacy
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['services/ballot/src', 'services/results/src', 'services/transparency/src'];
const FORBIDDEN = [/voterId\s*[:?.]/, /voter_id\s*[:?."]/i, /\.voterId/i, /\bCIN\s*[:?."]/i, /national[_-]?id\s*[:?."]/i];
// Incidents carry metadata only: no vote choices, no voter IDs, no ballot linkage.
const INCIDENT_ROOTS = ['services/incidents/src'];
const INCIDENT_FORBIDDEN = [/choiceId\s*[:?.]/, /\.choice\b/, /voterId\s*[:?.]/, /\.voterId/i, /\bCIN\s*[:?."]/i, /tokenHash\s*[:?.]/];
let failed = false;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function walk(dir, patterns) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p, patterns); continue; }
    if (!/\.(ts|js)$/.test(p)) continue;
    const src = stripComments(readFileSync(p, 'utf8'));
    for (const re of patterns) {
      if (re.test(src)) { console.error(`PRIVACY VIOLATION ${p}: matches ${re}`); failed = true; }
    }
  }
}
for (const r of ROOTS) walk(r, FORBIDDEN);
for (const r of INCIDENT_ROOTS) walk(r, INCIDENT_FORBIDDEN);

// Join check: no module may touch BOTH the identity store and the ballot store —
// that join is the forbidden voter → vote reconstruction path (docs/architecture/database.md).
// Exemptions (audited, transient-only, persistence separation covered by tests/paper.test.ts):
//   - services/election-core/src/store.ts (the store layer itself)
//   - voting/client/src/machine.ts (the polling booth: voter present and casting;
//     must never persist voter↔ballot linkage — verified by data-level scan in tests)
import { execSync as _exec } from 'node:child_process';
try {
  // find(1) covers untracked files too (git ls-files would miss them)
  const files = _exec('find services voting research apps -name "*.ts" 2>/dev/null',
    { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  const EXEMPT = new Set([
    'services/election-core/src/store.ts',
    // Polling booth (voter present and casting) and scenario harnesses:
    // all bridge transiently but persist the domains separately — verified by
    // the data-level separation scans in tests/paper.test.ts.
    'voting/client/src/machine.ts',
    'research/simulations/simulate.ts',
    'research/simulations/chaos.ts',
    'research/simulations/barriers.ts',
  ]);
  for (const f of files) {
    if (EXEMPT.has(f)) continue;
    const src = stripComments(readFileSync(f, 'utf8'));
    const hitsIdentity = /loadVoters|saveVoters|identity\/voters/.test(src);
    const hitsBallot = /loadBallots|saveBallots|voting\/ballots/.test(src);
    if (hitsIdentity && hitsBallot) {
      console.error(`PRIVACY VIOLATION ${f}: touches BOTH identity and ballot stores (forbidden join)`);
      failed = true;
    }
  }
  // Boundary check: observer/aggregate paths must never read paper slips or the
  // verification module (paper contains choices by nature). The public portal
  // may read election/results/events/incidents stores only — never identity
  // or ballot stores (field-level stripping is tested in tests/portal.test.ts).
  const PAPER_RE = /voting\/verification|data\/paper|paperDir|readSlips/;
  for (const f of files) {
    if (f.startsWith('voting/verification/') || f.startsWith('tests/')) continue;
    const src = stripComments(readFileSync(f, 'utf8'));
    if (/services\/transparency|services\/incidents/.test(f) && PAPER_RE.test(src)) {
      console.error(`PRIVACY VIOLATION ${f}: observer path must not read paper records`);
      failed = true;
    }
    if (/^apps\//.test(f) && /loadVoters|saveVoters|loadBallots|saveBallots|identity\/voters|voting\/ballots/.test(src)) {
      console.error(`PRIVACY VIOLATION ${f}: public portal must not touch identity or ballot stores`);
      failed = true;
    }
    // machine.ts may loadResults solely to replace its OWN station entry on re-close
    // (verified by tests/paper.test.ts: foreign packages untouched); it must never
    // branch on published totals.
    if (/^voting\/client\//.test(f) && f !== 'voting/client/src/machine.ts' && /loadResults/.test(src)) {
      console.error(`PRIVACY VIOLATION ${f}: polling booth must not read published results`);
      failed = true;
    }
  }
} catch (e) {
  console.error(`join check could not run: ${e.message}`);
  failed = true;
}
if (failed) { console.error('lint:privacy FAILED'); process.exit(1); }
console.log('lint:privacy OK — stores separated; observer paths paper-blind; booth result-blind');
