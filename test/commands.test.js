import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/commands.js';

test('empty text lists everything', () => {
  assert.deepEqual(parseCommand(''), { action: 'list' });
  assert.deepEqual(parseCommand('   '), { action: 'list' });
  assert.deepEqual(parseCommand(undefined), { action: 'list' });
});

test('a status word filters the list', () => {
  assert.deepEqual(parseCommand('active'), { action: 'list', status: 'active' });
  assert.deepEqual(parseCommand('reversed'), { action: 'list', status: 'reversed' });
});

test('"revisiting" maps to the stored "revisited" status', () => {
  assert.deepEqual(parseCommand('revisiting'), { action: 'list', status: 'revisited' });
  assert.deepEqual(parseCommand('Revisited'), { action: 'list', status: 'revisited' });
});

test('unknown input is an error', () => {
  assert.equal(parseCommand('frobnicate').action, 'error');
});

test('search carries the rest of the text as the query', () => {
  assert.deepEqual(parseCommand('search postgres migration'), { action: 'search', query: 'postgres migration' });
  assert.deepEqual(parseCommand('find  Redis'), { action: 'search', query: 'Redis' });
});

test('search without a query is an error', () => {
  assert.equal(parseCommand('search').action, 'error');
});

test('a status word followed by more text is not a filter', () => {
  assert.equal(parseCommand('active stuff').action, 'error');
});
