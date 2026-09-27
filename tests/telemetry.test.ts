import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTelemetry, type StationTelemetry } from '../services/audit/src/index.js';

function normal(id: string): StationTelemetry {
  return {
    id, turnoutPct: 55, invalidPct: 0.5, openMinutes: 620,
    resultDelayMinutes: 10, exceptionCount: 0, reopenCount: 0, recountMismatch: false,
  };
}

describe('telemetry: quiet stations stay clean', () => {
  it('no flags for a normal election day', () => {
    const flags = analyzeTelemetry([normal('S1'), normal('S2'), normal('S3')]);
    assert.equal(flags.length, 0);
  });
});

describe('telemetry: each signal trips', () => {
  it('timing, delay, exceptions, reopens, recount mismatch', () => {
    const stations = [
      normal('S1'),
      { ...normal('S2'), openMinutes: 1450 }, // >2× median 620
      { ...normal('S3'), openMinutes: 20, turnoutPct: 60 }, // fast close, high turnout
      { ...normal('S4'), resultDelayMinutes: 180 },
      { ...normal('S5'), exceptionCount: 2 },
      { ...normal('S6'), reopenCount: 1 },
      { ...normal('S7'), recountMismatch: true },
    ];
    const flags = analyzeTelemetry(stations);
    const byId = new Map(flags.map((f) => [f.id, f.reason]));
    assert.ok(byId.get('S2')?.includes('median'));
    assert.ok(byId.get('S3')?.includes('closed in 20min'));
    assert.ok(byId.get('S4')?.includes('delay'));
    assert.ok(byId.get('S5')?.includes('exception'));
    assert.ok(byId.get('S6')?.includes('reopened'));
    assert.ok(byId.get('S7')?.includes('mismatch'));
    assert.ok(!byId.has('S1'));
    // Flags are review tickets, never verdicts.
    for (const f of flags) assert.match(f.reason, /investigate/);
  });
});
