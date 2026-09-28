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
