// Polling-station CLI — open / vote / close / status / verify-receipt.
// Usage: node dist/voting/client/src/cli.js <open|vote|close|status|verify-receipt> [--station X] ...
import { readFileSync } from 'node:fs';
import { DATA_ROOT, castBallot, closeMachine, openMachine, stationDashboard, verifyParticipationReceipt, type StationDashboard } from './machine.js';
import { loadElection, loadVoters } from '../../../services/election-core/src/store.js';
import { resolveLocale, localeStatus, t, type Locale } from '../../../services/election-core/src/i18n.js';

function args(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const raw = process.argv.slice(3);
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i].match(/^--([^=]+)=?(.*)$/);
    if (!m) continue;
    if (m[2] !== '') out[m[1]] = m[2];
    else if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) out[m[1]] = raw[++i];
    else out[m[1]] = true;
  }
  return out;
}

function str(a: Record<string, string | true>, k: string, fallback = ''): string {
  const v = a[k];
  return v === undefined || v === true ? fallback : String(v);
}

function approvalsOf(a: Record<string, string | true>): string[] {
  return str(a, 'approvals').split(',').map((x) => x.trim()).filter(Boolean);
}

function main(): void {
  const a = args();
  const root = str(a, 'data', DATA_ROOT) || DATA_ROOT;
  const c = process.argv[2] ?? 'status';
  const lang: Locale = resolveLocale(a['lang']);
  if (localeStatus(lang) === 'provisional') {
    console.error(`note: the ${lang} bundle is provisional and needs native-speaker review (docs/accessibility/plan.md)`);
  }

  if (c === 'open') {
    const station = str(a, 'station');
    const firmware = str(a, 'firmware', 'sha256:sim-firmware-v1');
    if (!station) {
      console.error(t(lang, 'usage.open'));
      process.exit(2);
    }
    openMachine(root, station, firmware, approvalsOf(a));
    console.log(t(lang, 'station.opened', { station }));
    return;
  }

  if (c === 'vote') {
    const station = str(a, 'station');
    const voter = str(a, 'voter');
    const choice = str(a, 'choice');
    if (!station || !voter || !choice) {
      console.error(t(lang, 'usage.vote'));
      process.exit(2);
    }
    const confirm = str(a, 'spoil') ? false : true;
    try {
      const { ballotId, receipt, blinding } = castBallot(root, station, voter, choice, confirm);
      console.log(t(lang, 'vote.deposited', { id: ballotId, receipt, blinding }));
    } catch (e) {
      console.error(t(lang, 'vote.spoiled', { msg: (e as Error).message }));
      process.exit(4);
    }
    return;
  }

  if (c === 'verify-receipt') {
    const ballot = str(a, 'ballot');
    const code = str(a, 'code');
    const blinding = str(a, 'blinding', '');
    if (!ballot || !code) {
      console.error(t(lang, 'usage.verifyReceipt'));
      process.exit(2);
    }
    const v = verifyParticipationReceipt(root, { ballotId: ballot, code, blinding: blinding || undefined });
    if (v.included) {
      console.log(t(lang, 'receipt.verified', { code: code.toUpperCase(), station: v.station ?? '' }));
    } else {
      console.error(t(lang, 'receipt.failed', { code: code.toUpperCase() }));
      process.exit(3);
    }
    return;
  }

  if (c === 'close') {
    const station = str(a, 'station');
    if (!station) {
      console.error(t(lang, 'usage.close'));
      process.exit(2);
    }
    const endorsements = str(a, 'endorse').split(',').map((x) => x.trim()).filter(Boolean).map((pair) => {
      const i = pair.indexOf(':');
      if (i === -1) {
        console.error(t(lang, 'err.badEndorse', { entry: pair }));
        process.exit(2);
      }
      return { officer: pair.slice(0, i), signature: readFileSync(pair.slice(i + 1), 'utf8') };
    });
    try {
      const pkg = closeMachine(root, station, approvalsOf(a), { endorsements });
      console.log(t(lang, 'station.closed', { station, n: pkg.ballots_counted, h: String(pkg.result_hash).slice(0, 12) }));
    } catch (e) {
      console.error(t(lang, 'close.refused', { msg: (e as Error).message }));
      process.exit(3);
    }
    return;
  }

  // status (default): §13 polling-station dashboard; --json keeps machine-readable rows.
  const s = loadElection(root);
  const st = str(a, 'station');
  const ids = st ? [st] : s.stations.map((x) => x.id);
  if (st && !s.stations.some((x) => x.id === st)) {
    console.error(t(lang, 'err.missingStation'));
    process.exit(2);
  }
  if (a['json'] === true || String(a['json'] ?? '') === '1') {
    const voters = loadVoters(root);
    const rows = ids.map((id) => {
      const x = s.stations.find((y) => y.id === id)!;
      return {
        station: x.id, status: x.status, device: x.deviceId,
        voted: voters.filter((v) => v.stationId === x.id && v.status === 'VOTED').length,
      };
    });
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  for (const id of ids) {
    console.log(renderDashboard(lang, stationDashboard(root, id)));
  }
}

function renderDashboard(lang: Locale, d: StationDashboard): string {
  const v = (key: string): string => t(lang, `dash.v.${key}`);
  const fw = d.firmware === 'verified' && d.firmwareVersion
    ? `${v('verified')} (${d.firmwareVersion})`
    : v(d.firmware);
  return [
    t(lang, 'dash.title', { station: d.station, state: t(lang, d.state === 'open' ? 'status.open' : 'status.closed') }),
    t(lang, 'dash.machine', { v: v(d.machine === 'ready' ? 'ready' : 'notProvisioned') }),
    t(lang, 'dash.firmware', { v: fw }),
    t(lang, 'dash.cert', { v: v(d.cert) }),
    t(lang, 'dash.storage', { v: v(d.storage) }),
    t(lang, 'dash.network', { v: v('disconnected') }),
    t(lang, 'dash.observers', { n: d.observers, o: d.officers }),
    t(lang, 'dash.ballots', { r: d.registered, v: d.voted, e: d.electronic, p: d.paper }),
    t(lang, 'dash.quorum', { o: d.openApprovals, c: d.closeApprovals }),
  ].join('\n');
}

main();
