import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ledgerBlocks,
  recallCard,
  guardianWarning,
  statusChanged,
  decisionDetail,
  statusBreakdown,
  maxLedgerItems,
  MESSAGE_BLOCK_LIMIT,
  HOME_BLOCK_LIMIT,
} from '../src/blocks.js';

function decision(id, status = 'active') {
  return {
    id,
    status,
    text: `Decision ${id}`,
    author_name: 'Priya',
    channel_name: 'architecture',
    permalink: `https://example.slack.com/archives/C1/p${id}`,
    created_at: 1700000000000 + id,
  };
}

const text = (blocks) => JSON.stringify(blocks);

test('statusBreakdown counts each status and skips empty ones', () => {
  const list = [decision(1), decision(2), decision(3, 'reversed')];
  assert.equal(statusBreakdown(list), '🟢 2 active · 🔴 1 reversed');
});

test('empty ledger invites the first capture', () => {
  const blocks = ledgerBlocks([]);
  assert.match(text(blocks), /Nothing saved yet/);
  assert.match(text(blocks), /React 📌/);
});

test('empty filtered ledger names the status', () => {
  const blocks = ledgerBlocks([], { status: 'reversed' });
  assert.equal(blocks[0].text.text, '📚 Reversed Decisions');
  assert.match(text(blocks), /No reversed decisions right now/);
});

test('each decision renders a section with a source link', () => {
  const blocks = ledgerBlocks([decision(7)]);
  const section = blocks.find((b) => b.type === 'section');
  assert.match(section.text.text, /#7/);
  assert.equal(section.accessory.url, 'https://example.slack.com/archives/C1/p7');
});

const many = (n) => Array.from({ length: n }, (_, i) => decision(n - i));

test('a long ledger stays within the message block limit', () => {
  const blocks = ledgerBlocks(many(200));
  assert.ok(blocks.length <= MESSAGE_BLOCK_LIMIT, `got ${blocks.length} blocks`);
  assert.match(text(blocks.at(-1)), /Showing the 15 most recent of 200/);
});

test('a long ledger stays within the Home view block limit', () => {
  const blocks = ledgerBlocks(many(200), { blockLimit: HOME_BLOCK_LIMIT });
  assert.ok(blocks.length <= HOME_BLOCK_LIMIT, `got ${blocks.length} blocks`);
  assert.equal(blocks.filter((b) => b.type === 'section').length, maxLedgerItems(HOME_BLOCK_LIMIT));
});

test('a ledger that fits is shown whole, with no footer', () => {
  const n = maxLedgerItems(MESSAGE_BLOCK_LIMIT);
  const blocks = ledgerBlocks(many(n));
  assert.ok(blocks.length <= MESSAGE_BLOCK_LIMIT);
  assert.equal(blocks.filter((b) => b.type === 'section').length, n);
  assert.doesNotMatch(text(blocks), /most recent of/);
});

test('quoted decision text never carries a live @channel', () => {
  const d = { ...decision(1), text: '<!channel> final call: Postgres' };
  const blocks = ledgerBlocks([d]);
  assert.doesNotMatch(text(blocks), /<!channel>/);
  assert.match(text(blocks), /@channel final call/);
});

test('model-written text in the recall card cannot ping the channel', () => {
  const blocks = recallCard({
    question: 'what did we pick? <!here>',
    result: {
      found: true,
      answer: '<!channel> we picked Postgres',
      reasoning: 'Dana said so <!everyone>',
      who: 'Dana',
      when: 'unknown',
      citations: [],
    },
    evidence: [],
    source: 'conversations.history',
  });
  assert.doesNotMatch(text(blocks), /<!(channel|here|everyone)>/);
});

test('model-written guardian explanation cannot ping the channel', () => {
  const blocks = guardianWarning({
    decision: decision(3),
    confidence: 0.9,
    explanation: '<!channel> this reverses Postgres',
  });
  assert.doesNotMatch(text(blocks), /<!channel>/);
  assert.match(text(blocks), /confidence 90%/);
});

test('statusChanged names the new and the previous status', () => {
  const blocks = statusChanged({ decision: decision(4, 'reversed'), previous: 'active', byName: 'Sam' });
  assert.match(blocks[0].text.text, /Decision #4 is now reversed\* \(was active\)/);
  assert.match(text(blocks), /changed by \*Sam\*/);
});

test('statusChanged says so when nothing changed', () => {
  const blocks = statusChanged({ decision: decision(4, 'reversed'), previous: 'reversed', byName: 'Sam' });
  assert.match(blocks[0].text.text, /was already reversed/);
});

test('decisionDetail shows the full text and who saved it', () => {
  const d = { ...decision(9), text: 'x'.repeat(500), captured_by: 'Arjun' };
  const blocks = decisionDetail({ decision: d });
  assert.equal(blocks[0].text.text, 'Decision #9');
  assert.ok(blocks[1].text.text.includes('x'.repeat(500)));
  assert.match(text(blocks), /by \*Arjun\*/);
  assert.doesNotMatch(text(blocks), /History/);
});

test('decisionDetail lists status history oldest first', () => {
  const history = [
    { from_status: 'active', to_status: 'revisited', actor: 'Sara', created_at: 1700000001000 },
    { from_status: 'revisited', to_status: 'reversed', actor: null, created_at: 1700000002000 },
  ];
  const blocks = decisionDetail({ decision: decision(9, 'reversed'), history });
  const body = blocks.at(-1).text.text;
  assert.ok(body.indexOf('Active → *Revisiting* by Sara') < body.indexOf('Revisiting → *Reversed* by someone'));
});

test('decisionDetail keeps very long text inside the section limit', () => {
  const d = { ...decision(9), text: 'y'.repeat(5000) };
  assert.ok(decisionDetail({ decision: d })[1].text.text.length <= 3000);
});
