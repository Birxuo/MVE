// Transmission CLI — terminal-init / export / import.
// Two data roots: station media (--data, default data/) and national terminal
// (--national, default national/). Bundles move between them offline.
// Usage: node dist/services/transmission/src/cli.js <terminal-init|export|import> [...]
import { readFileSync } from 'node:fs';
import { DATA_ROOT, ensureDataDirs } from '../../election-core/src/store.js';
import { exportStation, importBundle, terminalInit } from './index.js';

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

function main(): void {
  const a = args();
  const c = process.argv[2] ?? '';
  const national = str(a, 'national', 'national') || 'national';

  if (c === 'terminal-init') {
    ensureDataDirs(national);
    const pub = terminalInit(national);
    console.log(`terminal initialized at ${national}/ (public key below — copy to stations)`);
    console.log(pub);
    return;
  }

  if (c === 'export') {
    const root = str(a, 'data', DATA_ROOT) || DATA_ROOT;
    const station = str(a, 'station');
    const out = str(a, 'out', `${station}.mvepkg`);
    const tpub = str(a, 'terminal-pub');
    if (!station || !tpub) {
      console.error('usage: export --station X --terminal-pub terminal.pub.pem [--out X.mvepkg] [--data data]');
      process.exit(2);
    }
    exportStation(root, station, readFileSync(tpub, 'utf8'), out);
    console.log(`${station} sealed → ${out} (carry offline to the terminal)`);
    return;
  }

  if (c === 'import') {
    const file = str(a, 'file');
    if (!file) {
      console.error('usage: import --file X.mvepkg [--national national]');
      process.exit(2);
    }
    try {
      const { station } = importBundle(national, file);
      console.log(`${station} verified + merged into ${national}/`);
    } catch (e) {
      console.error(`IMPORT REFUSED: ${(e as Error).message}`);
      process.exit(3);
    }
    return;
  }

  console.error('usage: transmission <terminal-init|export|import> [...]');
  process.exit(2);
}

main();
