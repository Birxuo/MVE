import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adjudicateSample, resolveRlaSample, sampleSizeFor, sampleStations, seedFromCeremony, SAMPLE_TABLE,
} from '../services/audit/src/index.js';
import { saveRlaCeremony } from '../services/election-core/src/store.js';

describe('rla: pre-committed table', () => {
  it('looks up rows without negotiation', () => {
    assert.deepEqual(sampleSizeFor(5), { sample: 2, allowed: 0 });
    assert.deepEqual(sampleSizeFor(200), { sample: 20, allowed: 1 });
    assert.deepEqual(sampleSizeFor(100000), { sample: 100, allowed: 2 });
    assert.ok(SAMPLE_TABLE.length > 0);
    // Sample never exceeds the station count.
    assert.equal(sampleSizeFor(1).sample, 1);
  });
});

describe('rla: ceremony seed', () => {
  it('binds the published hex deterministically; rejects short input', () => {
    const a = seedFromCeremony('9f3a7c1d44aa90be12');
    const b = seedFromCeremony('9f3a7c1d44aa90be12');
    assert.equal(a, b);
    assert.throws(() => seedFromCeremony('abc'), /≥16 hex/);
    assert.throws(() => seedFromCeremony('zzzzzzzzzzzzzzzz'), /hex/);
    const stations = ['S1', 'S2', 'S3', 'S4', 'S5'];
    assert.deepEqual(
      sampleStations(stations, 2, seedFromCeremony('9f3a7c1d44aa90be12')),
      sampleStations(stations, 2, a),
    );
  });
});

describe('rla: adjudication', () => {
  it('PASS / ESCALATE / FULL_RECOUNT with expansion sizing', () => {
    const clean = Array.from({ length: 20 }, (_, i) => ({ station: `S${i}`, match: true }));
    assert.deepEqual(adjudicateSample(200, clean), { mismatches: 0, verdict: 'PASS', nextSample: 20 });
    const one = clean.map((c, i) => (i === 0 ? { ...c, match: false } : c));
    assert.deepEqual(adjudicateSample(200, one), { mismatches: 1, verdict: 'ESCALATE', nextSample: 60 });
    const two = one.map((c, i) => (i === 1 ? { ...c, match: false } : c));
    assert.deepEqual(adjudicateSample(200, two), { mismatches: 2, verdict: 'FULL_RECOUNT', nextSample: 200 });
    // Small elections tolerate nothing.
    const smallBad = [{ station: 'S1', match: false }];
    assert.equal(adjudicateSample(5, smallBad).verdict, 'FULL_RECOUNT');
  });
});

describe('rla: sample resolution (ceremony-bound, no negotiation)', () => {
  const stations = ['S1', 'S2', 'S3', 'S4', 'S5'];

  it('off by default; bad sizes refused', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rla-'));
    assert.equal(resolveRlaSample(root, stations, { sample: '0' }), null);
    assert.throws(() => resolveRlaSample(root, stations, { sample: 'nope' }), /bad --sample/);
  });

  it('--ceremony flag wins and is reproducible', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rla-'));
    const a = resolveRlaSample(root, stations, { sample: '2', ceremony: '9f3a7c1d44aa90be12' });
    const b = resolveRlaSample(root, stations, { sample: '2', ceremony: '9f3a7c1d44aa90be12' });
    assert.ok(a && b && !a.manual && !b.manual);
    assert.deepEqual(a.stations, b.stations);
    assert.throws(() => resolveRlaSample(root, stations, { sample: '2', ceremony: 'xyz' }), /ceremony/);
  });

  it('recorded ceremony applies automatically; explicit flag overrides it', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rla-'));
    saveRlaCeremony({
      hex: '9f3a7c1d44aa90be12', seed: seedFromCeremony('9f3a7c1d44aa90be12'),
      publishedAt: '2026-09-23T00:00:00Z', publishedBy: 'observer',
    }, root);
    const auto = resolveRlaSample(root, stations, { sample: '2' });
    assert.ok(auto && !auto.manual && auto.ceremonyHex === '9f3a7c1d44aa90be12');
    const over = resolveRlaSample(root, stations, { sample: '2', ceremony: 'aaaaaaaaaaaaaaaa' });
    assert.ok(over && over.ceremonyHex === 'aaaaaaaaaaaaaaaa');
    assert.notDeepEqual(over.stations, auto.stations);
  });

  it('no ceremony anywhere → manual seed flagged demo-only', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rla-'));
    const m = resolveRlaSample(root, stations, { sample: '2', seed: '7' });
    assert.ok(m && m.manual && m.ceremonyHex === null);
  });

  it('--sample auto follows the pre-committed table', () => {
    const root = mkdtempSync(join(tmpdir(), 'mve-rla-'));
    const big = Array.from({ length: 200 }, (_, i) => `S${i}`);
    const cfg = resolveRlaSample(root, big, { sample: 'auto', ceremony: '9f3a7c1d44aa90be12' });
    assert.ok(cfg && cfg.sampleSize === 20 && cfg.stations.length === 20);
  });
});
