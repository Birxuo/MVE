// MVE independent verify bundle — NO dependency on the MVE codebase.
// Only node:crypto + node:fs. Read these ~160 lines in full before trusting it;
// that is the entire point (FULL_PLAN §29: no "trust our proprietary algorithm").
//
// Verifies, from the §42 open dataset alone:
//   1. every results.csv row's result_hash recomputes from its own fields
//      (canonical JSON, sorted keys — reimplemented here, deliberately NOT imported)
//   2. each row's counted total equals the sum of its per-choice counts
//   3. with --pubkeys <dir>: every Ed25519 signature verifies (<station>.pem files)
// Prints national totals. Exit 0 iff everything checks, 3 otherwise.
//
// Usage: node verify-bundle.js --dir open-data [--pubkeys station-keys/]
import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function arg(key, fallback) {
  const i = process.argv.indexOf(`--${key}`);
  if (i !== -1 && process.argv[i + 1] && !String(process.argv[i + 1]).startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${key}=`));
  return eq ? eq.slice(key.length + 3) : fallback;
}

// Minimal RFC-4180 reader (quotes, escaped "", commas, CRLF).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function canonical(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(canonical).join(',')}]`;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

const DIR = arg('dir', 'open-data');
const PUBKEYS = arg('pubkeys', '');

// Revocation: if revoked.csv ships with the dataset, those stations verify
// as INVALID regardless of hash/signature state.
const revoked = new Set();
const revokedPath = join(DIR, 'revoked.csv');
if (existsSync(revokedPath)) {
  const [rhead, ...rlines] = parseCSV(readFileSync(revokedPath, 'utf8'));
  const si = rhead.indexOf('station');
  for (const l of rlines) if (l[si]) revoked.add(l[si]);
}

const raw = readFileSync(join(DIR, 'results.csv'), 'utf8');
const [header, ...lines] = parseCSV(raw);
const need = ['election', 'station', 'device', 'ballots_issued', 'counted', 'invalid',
  'timestamp', 'firmware_hash', 'result_hash', 'signature', 'audit'];
for (const col of need) {
  if (!header.includes(col)) {
    console.error(`results.csv missing column: ${col}`);
    process.exit(2);
  }
}
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const choices = header.filter((h) => !need.includes(h));
if (!choices.length) {
  console.error('results.csv has no per-choice columns');
  process.exit(2);
}

let bad = 0;
const totals = {};
for (const line of lines) {
  const station = line[idx.station];
  // The tally omits zero-count choices (no key = zero votes); mirror that rule
  // so the rebuilt body matches the signed package exactly.
  const results = {};
  for (const c of choices) {
    const n = Number(line[idx[c]]);
    if (n !== 0) results[c] = n;
  }
  const body = {
    election: line[idx.election],
    polling_station: station,
    device: line[idx.device],
    ballots_issued: Number(line[idx.ballots_issued]),
    ballots_counted: Number(line[idx.counted]),
    invalid_ballots: Number(line[idx.invalid]),
    results,
    timestamp: line[idx.timestamp],
    firmware_hash: line[idx.firmware_hash],
  };
  const recomputed = createHash('sha256').update(canonical(body)).digest('hex');
  const hashOk = recomputed === line[idx.result_hash];
  const sum = Object.values(results).reduce((a, n) => a + n, 0);
  const countOk = sum === body.ballots_counted;
  let sig = 'skipped';
  if (PUBKEYS) {
    const pemPath = join(PUBKEYS, `${station}.pem`);
    try {
      const ok = verify(
        null, Buffer.from(line[idx.result_hash], 'hex'),
        createPublicKey(readFileSync(pemPath, 'utf8')),
        Buffer.from(line[idx.signature], 'hex'),
      );
      sig = ok ? 'OK' : 'FAIL';
    } catch { sig = 'FAIL'; }
  }
  const ok = hashOk && countOk && sig !== 'FAIL' && !revoked.has(station);
  if (!ok) bad++;
  console.log(`${station}: hash=${hashOk ? 'OK' : 'FAIL'} count=${countOk ? 'OK' : 'FAIL'} sig=${sig}${revoked.has(station) ? ' REVOKED' : ''} ${ok ? 'VALID' : 'INVALID'}`);
  for (const [c, n] of Object.entries(results)) totals[c] = (totals[c] || 0) + n;
}

console.log(`\nstations=${lines.length} INVALID=${bad}`);
console.log(`TOTALS ${Object.keys(totals).sort().map((c) => `${c}=${totals[c]}`).join(' ')}`);
process.exit(bad ? 3 : 0);
