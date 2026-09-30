import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, mostRelevant } from '../src/search.js';

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

const items = [
  { id: 1, text: 'Deploy once a day at 10am' },
  { id: 2, text: 'PostgreSQL is the main database' },
  { id: 3, text: 'Standard backend language is Go' },
  { id: 4, text: 'Database migrations run before deploy' },
];
const ids = (list) => list.map((x) => x.id);

test('mostRelevant returns everything when it already fits', () => {
  assert.equal(mostRelevant(items, 'anything', { limit: 4 }), items);
});

test('mostRelevant puts the best word overlap first', () => {
  assert.deepEqual(ids(mostRelevant(items, 'which database for migrations?', { limit: 2 })), [4, 2]);
});

test('mostRelevant fills up with the earliest items when nothing matches', () => {
  assert.deepEqual(ids(mostRelevant(items, 'pricing model', { limit: 2 })), [1, 2]);
});

test('mostRelevant can score a field other than text', () => {
  const rows = [{ body: 'redis cache' }, { body: 'postgres' }];
  assert.deepEqual(mostRelevant(rows, 'postgres', { limit: 1, text: (r) => r.body }), [rows[1]]);
});
