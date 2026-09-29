import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, toJSON } from '../src/export.js';

const at = Date.UTC(2026, 8, 29, 12);
const decisions = [
  {
    id: 2,
    status: 'revisited',
    text: 'Deploy once a day at 10am.\nNo Friday deploys.',
    author_name: 'Dev',
    channel_name: 'engineering',
    permalink: 'https://example.slack.com/archives/C1/p2',
    captured_by: 'Arjun',
    created_at: at,
    updated_at: at,
  },
  {
    id: 1,
    status: 'active',
    text: 'Postgres, see <https://example.com/adr-1|ADR 1>',
    author_name: null,
    channel_name: null,
    permalink: null,
    captured_by: null,
    created_at: at,
    updated_at: at,
  },
];

test('toMarkdown writes a heading per decision with its status', () => {
  const md = toMarkdown(decisions, { generatedAt: at });
  assert.match(md, /^# Decision ledger\n\n_2 decisions · exported 2026-09-29_\n/);
  assert.match(md, /## #2 — Revisiting/);
  assert.match(md, /## #1 — Active/);
});

test('toMarkdown quotes every line of a multi-line decision', () => {
  const md = toMarkdown(decisions, { generatedAt: at });
  assert.match(md, /> Deploy once a day at 10am\.\n> No Friday deploys\./);
});

test('toMarkdown includes source links and converts Slack links', () => {
  const md = toMarkdown(decisions, { generatedAt: at });
  assert.match(md, /- \*\*Source:\*\* https:\/\/example\.slack\.com\/archives\/C1\/p2/);
  assert.match(md, /\[ADR 1\]\(https:\/\/example\.com\/adr-1\)/);
});

test('toMarkdown copes with missing author, channel and permalink', () => {
  const md = toMarkdown([decisions[1]], { generatedAt: at });
  assert.match(md, /_1 decision · exported/);
  assert.match(md, /- \*\*By:\*\* unknown in #\?/);
  assert.doesNotMatch(md, /Source/);
});

test('toJSON is valid JSON with ISO timestamps', () => {
  const rows = JSON.parse(toJSON(decisions));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].created_at, '2026-09-29T12:00:00.000Z');
  assert.equal(rows[0].author, 'Dev');
  assert.equal(rows[1].author, null);
});
