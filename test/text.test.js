import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate, quote } from '../src/text.js';

test('truncate leaves short text alone', () => {
  assert.equal(truncate('hello', 10), 'hello');
});

test('truncate cuts long text and adds an ellipsis', () => {
  assert.equal(truncate('abcdefghij', 4), 'abcd…');
});

test('truncate collapses whitespace before measuring', () => {
  assert.equal(truncate('  a \n\n b\t c  ', 20), 'a b c');
});

test('truncate treats missing input as empty', () => {
  assert.equal(truncate(null, 5), '');
});

test('quote prefixes every line', () => {
  assert.equal(quote('one\ntwo'), '> one\n> two');
});

test('quote handles missing input', () => {
  assert.equal(quote(undefined), '> ');
});
