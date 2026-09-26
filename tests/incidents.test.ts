import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createIncident, incidentsFromFlags, reopenIncident, resolveIncident, summarize, triageIncident,
  type Incident,
} from '../services/incidents/src/index.js';

function fresh(): Incident[] { return []; }

describe('incidents: report validation', () => {
  it('rejects invalid category and empty description', () => {
    const list = fresh();
    assert.throws(
      () => createIncident(list, { stationId: 'S1', category: 'ufo', description: 'x' }),
      /invalid category/,
    );
    assert.throws(
      () => createIncident(list, { stationId: 'S1', category: 'other', description: '   ' }),
      /description required/,
    );
    assert.equal(list.length, 0);
  });

  it('new reports are open and never touch results', () => {
    const list = fresh();
    const inc = createIncident(list, {
      stationId: 'S1', category: 'ballot-issue', description: 'seal mismatch', reporter: 'observer:1',
    });
    assert.equal(inc.status, 'open');
    assert.match(inc.id, /^INC-\d+$/);
    assert.ok(!('results' in inc) && !('choiceId' in inc));
  });
});

describe('incidents: workflow transitions', () => {
  it('open → investigating → resolved; resolve from open throws', () => {
    const list = fresh();
    createIncident(list, { stationId: 'S1', category: 'other', description: 'd' });
    assert.throws(() => resolveIncident(list, 'INC-0001', 'nope'), /cannot move open/);
    triageIncident(list, 'INC-0001', 'investigating', 'looking');
    assert.equal(list[0].status, 'investigating');
    resolveIncident(list, 'INC-0001', 'verified ok');
    assert.equal(list[0].status, 'resolved');
  });

  it('dismissed can reopen to triaged; triage needs a note', () => {
    const list = fresh();
    createIncident(list, { stationId: 'S1', category: 'other', description: 'd' });
    assert.throws(() => triageIncident(list, 'INC-0001', 'dismissed', '  '), /note required/);
    triageIncident(list, 'INC-0001', 'dismissed', 'duplicate');
    reopenIncident(list, 'INC-0001', 'new evidence');
    assert.equal(list[0].status, 'triaged');
  });
});

describe('incidents: anomaly bridge', () => {
  it('flags become triaged incidents, no duplicates, summary counts', () => {
    const list = fresh();
    const made = incidentsFromFlags(list, [{ id: 'S1', reason: 'turnout 99.2% — investigate' }]);
    assert.equal(made.length, 1);
    assert.equal(list[0].status, 'triaged');
    assert.equal(list[0].reporter, 'system:anomaly-detector');
    const again = incidentsFromFlags(list, [{ id: 'S1', reason: 'turnout 99.2% — investigate' }]);
    assert.equal(again.length, 0);
    assert.deepEqual(summarize(list), { open: 0, triaged: 1, investigating: 0, resolved: 0, dismissed: 0 });
  });
});
