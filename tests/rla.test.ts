import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjudicateSample, sampleSizeFor, sampleStations, seedFromCeremony, SAMPLE_TABLE,
} from '../services/audit/src/index.js';

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
