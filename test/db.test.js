import { test } from 'node:test';
import assert from 'node:assert/strict';

// Use a throwaway in-memory database; must be set before db.js is imported.
process.env.DB_PATH = ':memory:';
const { saveDecision, listDecisions, getDecision, setStatus, hasDecision, searchDecisions } = await import(
  '../src/db.js'
);

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

test('searchDecisions matches text case-insensitively', () => {
  const d = saveDecision(sample({ text: 'We are going with PostgreSQL for the API' })).decision;
  assert.ok(searchDecisions('postgresql').some((x) => x.id === d.id));
});

test('searchDecisions requires every word to match', () => {
  const d = saveDecision(sample({ text: 'Deploy once a day at 10am' })).decision;
  assert.ok(searchDecisions('deploy 10am').some((x) => x.id === d.id));
  assert.ok(!searchDecisions('deploy friday').some((x) => x.id === d.id));
});

test('searchDecisions also looks at author and channel', () => {
  const d = saveDecision(sample({ author_name: 'Zainab', channel_name: 'billing' })).decision;
  assert.ok(searchDecisions('zainab').some((x) => x.id === d.id));
  assert.ok(searchDecisions('billing').some((x) => x.id === d.id));
});

test('searchDecisions treats % and _ literally', () => {
  const d = saveDecision(sample({ text: 'Target 100% coverage on snake_case modules' })).decision;
  assert.ok(searchDecisions('100%').some((x) => x.id === d.id));
  assert.ok(searchDecisions('snake_case').some((x) => x.id === d.id));
  assert.deepEqual(searchDecisions('%'), [d]);
  assert.ok(!searchDecisions('snakeXcase').some((x) => x.id === d.id));
});

test('searchDecisions returns nothing for a blank query', () => {
  assert.deepEqual(searchDecisions('   '), []);
});

test('setStatus rejects a status the ledger does not know', () => {
  const d = saveDecision(sample()).decision;
  assert.throws(() => setStatus(d.id, 'archived'), /Unknown status/);
  assert.equal(getDecision(d.id).status, 'active');
});

test('setStatus returns undefined for a missing decision', () => {
  assert.equal(setStatus(999999, 'reversed'), undefined);
});
