import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('barriers: every single-barrier defeat is caught by another', () => {
  it('barriers driver exits 0 with 6/6 detected', () => {
    const r = spawnSync(process.execPath, [join(process.cwd(), 'dist/research/simulations/barriers.js')],
      { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr.slice(-300));
    assert.match(r.stdout, /6\/6 defeats detected/);
  });
});
