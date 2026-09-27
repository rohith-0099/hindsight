import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/search.js';

test('tokenize lowercases and strips punctuation', () => {
  assert.deepEqual(tokenize('PostgreSQL, Redis!'), ['postgresql', 'redis']);
});

test('tokenize drops stopwords and short words', () => {
  assert.deepEqual(tokenize('What database did we decide to go with?'), ['database']);
});

test('tokenize handles empty and missing input', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
});

test('tokenize keeps digits', () => {
  assert.deepEqual(tokenize('deploy at 10am, node20'), ['deploy', '10am', 'node20']);
});
