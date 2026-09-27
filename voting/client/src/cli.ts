// Polling-station CLI — open / vote / close / status.
// Usage: node dist/voting/client/src/cli.js <open|vote|close|status> [--station X] ...
import { readFileSync } from 'node:fs';
import { DATA_ROOT, castBallot, closeMachine, openMachine } from './machine.js';
import { loadElection, loadVoters } from '../../../services/election-core/src/store.js';
import { resolveLocale, t, type Locale } from '../../../services/election-core/src/i18n.js';

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
      const { ballotId, receipt } = castBallot(root, station, voter, choice, confirm);
      console.log(t(lang, 'vote.deposited', { id: ballotId, receipt }));
    } catch (e) {
      console.error(t(lang, 'vote.spoiled', { msg: (e as Error).message }));
      process.exit(4);
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

  // status (default): station state + authorized/voted counts
  const s = loadElection(root);
  const voters = loadVoters(root);
  const st = str(a, 'station');
  const rows = (st ? s.stations.filter((x) => x.id === st) : s.stations).map((x) => ({
    station: x.id, status: x.status, device: x.deviceId,
    voted: voters.filter((v) => v.stationId === x.id && v.status === 'VOTED').length,
  }));
  console.log(JSON.stringify(rows, null, 2));
}

main();
