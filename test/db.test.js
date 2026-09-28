import { test } from 'node:test';
import assert from 'node:assert/strict';

// Use a throwaway in-memory database; must be set before db.js is imported.
process.env.DB_PATH = ':memory:';
const { saveDecision, listDecisions, getDecision, setStatus, hasDecision } = await import('../src/db.js');

let n = 0;
function sample(overrides = {}) {
  n += 1;
  return {
    text: `Decision number ${n}`,
    author_id: 'U1',
    author_name: 'Priya',
    channel_id: 'C1',
    channel_name: 'architecture',
    message_ts: `1700000000.${String(n).padStart(6, '0')}`,
    permalink: null,
    captured_by: 'test',
    ...overrides,
  };
}

test('saveDecision stores a new decision as active', () => {
  const { created, decision } = saveDecision(sample());
  assert.equal(created, true);
  assert.equal(decision.status, 'active');
  assert.equal(getDecision(decision.id).text, decision.text);
});

test('saveDecision is idempotent per channel and message', () => {
  const d = sample();
  const first = saveDecision(d);
  const second = saveDecision({ ...d, text: 'changed' });
  assert.equal(second.created, false);
  assert.equal(second.decision.id, first.decision.id);
  assert.equal(second.decision.text, d.text);
});

test('hasDecision reflects what was saved', () => {
  const d = sample();
  assert.equal(hasDecision(d.channel_id, d.message_ts), false);
  saveDecision(d);
  assert.equal(hasDecision(d.channel_id, d.message_ts), true);
});

test('listDecisions returns newest first', () => {
  const a = saveDecision(sample()).decision;
  const b = saveDecision(sample()).decision;
  const ids = listDecisions().map((d) => d.id);
  assert.ok(ids.indexOf(b.id) < ids.indexOf(a.id));
});

test('listDecisions filters by status', () => {
  const d = saveDecision(sample()).decision;
  setStatus(d.id, 'reversed');
  const reversed = listDecisions({ status: 'reversed' });
  assert.ok(reversed.some((x) => x.id === d.id));
  assert.ok(reversed.every((x) => x.status === 'reversed'));
  assert.ok(!listDecisions({ status: 'active' }).some((x) => x.id === d.id));
});
