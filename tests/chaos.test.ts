import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('chaos: power, partition, db-corruption drills detect', () => {
  it('chaos driver exits 0 with 3/3 detected', () => {
    const r = spawnSync(process.execPath, [join(process.cwd(), 'dist/research/simulations/chaos.js')],
      { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr.slice(-300));
    assert.match(r.stdout, /3\/3 scenarios detected/);
  });
});
