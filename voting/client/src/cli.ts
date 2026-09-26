// Polling-station CLI — open / vote / close / status.
// Usage: node dist/voting/client/src/cli.js <open|vote|close|status> [--station X] ...
import { DATA_ROOT, castBallot, closeMachine, openMachine } from './machine.js';
import { loadElection, loadVoters } from '../../../services/election-core/src/store.js';

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

  if (c === 'open') {
    const station = str(a, 'station');
    const firmware = str(a, 'firmware', 'sha256:sim-firmware-v1');
    if (!station) {
      console.error('usage: open --station X [--firmware H] --approvals presiding,observer');
      process.exit(2);
    }
    openMachine(root, station, firmware, approvalsOf(a));
    console.log(`${station} opened`);
    return;
  }

  if (c === 'vote') {
    const station = str(a, 'station');
    const voter = str(a, 'voter');
    const choice = str(a, 'choice');
    if (!station || !voter || !choice) {
      console.error('usage: vote --station X --voter V --choice C [--spoil]');
      process.exit(2);
    }
    const confirm = str(a, 'spoil') ? false : true;
    try {
      const { ballotId, receipt } = castBallot(root, station, voter, choice, confirm);
      console.log(`ballot ${ballotId} deposited. Participation receipt: ${receipt} (keeps no record of your choice)`);
    } catch (e) {
      console.error(`SPOILED: ${(e as Error).message}`);
      process.exit(4);
    }
    return;
  }

  if (c === 'close') {
    const station = str(a, 'station');
    if (!station) {
      console.error('usage: close --station X --approvals presiding,deputy,observer');
      process.exit(2);
    }
    try {
      const pkg = closeMachine(root, station, approvalsOf(a));
      console.log(`${station} closed. Counted ${pkg.ballots_counted}, hash ${String(pkg.result_hash).slice(0, 12)}...`);
    } catch (e) {
      console.error(`CLOSE REFUSED: ${(e as Error).message}`);
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
