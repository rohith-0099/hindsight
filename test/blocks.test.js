import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ledgerBlocks,
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
