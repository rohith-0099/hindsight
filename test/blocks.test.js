import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ledgerBlocks, statusBreakdown } from '../src/blocks.js';

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
