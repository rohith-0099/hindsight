import { test } from 'node:test';
import assert from 'node:assert/strict';

// Own file, own process, own empty database — the counts below are exact.
process.env.DB_PATH = ':memory:';
const { saveDecision, setStatus, ledgerStats } = await import('../src/db.js');

test('ledgerStats on an empty ledger', () => {
  assert.deepEqual(ledgerStats(), {
    total: 0,
    byStatus: { active: 0, revisited: 0, reversed: 0 },
    topAuthors: [],
    topChannels: [],
  });
});

test('ledgerStats counts statuses, authors and channels', () => {
  const rows = [
    ['Priya', 'architecture'],
    ['Priya', 'architecture'],
    ['Priya', 'engineering'],
    ['Sara', 'product'],
    ['Dev', 'engineering'],
    [null, 'engineering'],
  ];
  const ids = rows.map(([author_name, channel_name], i) =>
    saveDecision({
      text: `Decision ${i}`,
      author_id: null,
      author_name,
      channel_id: 'C1',
      channel_name,
      message_ts: `1700000000.00000${i}`,
      permalink: null,
      captured_by: 'test',
    }).decision.id,
  );
  setStatus(ids[0], 'reversed');
  setStatus(ids[1], 'revisited');

  const stats = ledgerStats({ top: 2 });
  assert.equal(stats.total, 6);
  assert.deepEqual(stats.byStatus, { active: 4, revisited: 1, reversed: 1 });
  assert.deepEqual(stats.topAuthors, [
    { name: 'Priya', count: 3 },
    { name: 'Dev', count: 1 },
  ]);
  assert.deepEqual(stats.topChannels, [
    { name: 'engineering', count: 3 },
    { name: 'architecture', count: 2 },
  ]);
});
