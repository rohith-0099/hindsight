import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate, quote, defuseMentions } from '../src/text.js';

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

test('defuseMentions rewrites channel-wide mentions', () => {
  assert.equal(defuseMentions('<!channel> final call'), '@channel final call');
  assert.equal(defuseMentions('heads up <!here|here>'), 'heads up @here');
  assert.equal(defuseMentions('<!everyone>'), '@everyone');
});

test('defuseMentions rewrites user group mentions', () => {
  assert.equal(defuseMentions('cc <!subteam^S0123|@backend>'), 'cc @backend');
  assert.equal(defuseMentions('cc <!subteam^S0123>'), 'cc @group');
});

test('defuseMentions leaves links, users and dates alone', () => {
  const s = 'see <https://example.com|docs>, ask <@U123>, due <!date^1700000000^{date}|soon>';
  assert.equal(defuseMentions(s), s);
});

test('defuseMentions handles missing input', () => {
  assert.equal(defuseMentions(null), '');
});
