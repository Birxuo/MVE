// Verify-bundle cross-checks — the standalone bundle must agree with internal
// tally/verify on real simulated output, and must catch a tampered CSV.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadBallots } from '../services/election-core/src/store.js';
import { tally } from '../services/results/src/index.js';

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, args, { encoding: 'utf8', cwd });
}

describe('verify-bundle: agrees with internal tally', () => {
  it('bundle TOTALS match tally() on a 2-station sim; tampered CSV exits 3', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-vb-'));
    const data = join(root, 'data');
    const out = join(root, 'open-data');
    const repo = process.cwd();

    let r = run([join(repo, 'dist/research/simulations/simulate.js'),
      '--stations', '2', '--voters', '6', '--seed', '11', '--data', data], repo);
    assert.equal(r.status, 0, r.stderr.slice(-300));
    r = run([join(repo, 'dist/services/transparency/src/cli.js'),
      'export-all', '--dir', out, '--data', data], repo);
    assert.equal(r.status, 0, r.stderr.slice(-300));

    r = run([join(repo, 'apps/verification/verify-bundle.js'), '--dir', out], repo);
    assert.equal(r.status, 0, r.stdout.slice(-300));

    // Cross-check: bundle totals vs internal tally over the ballot store.
    const internal = tally(loadBallots(data));
    const m = r.stdout.match(/TOTALS (.*)/);
    assert.ok(m, 'bundle prints TOTALS');
    for (const [choice, n] of Object.entries(internal.results)) {
      assert.ok(m[1].includes(`${choice}=${n}`), `total ${choice}=${n} reproduced`);
    }

    // Negative: corrupt one hash → exit 3 with an INVALID row.
    const csvPath = join(out, 'results.csv');
    const lines = readFileSync(csvPath, 'utf8').split('\n');
    assert.ok(lines.length > 2);
    lines[1] = lines[1].replace(/,[0-9a-f]{64},/, ',0000000000000000000000000000000000000000000000000000000000000000,');
    writeFileSync(csvPath, lines.join('\n'));
    r = run([join(repo, 'apps/verification/verify-bundle.js'), '--dir', out], repo);
    assert.equal(r.status, 3);
    assert.match(r.stdout, /INVALID/);
  });
});
