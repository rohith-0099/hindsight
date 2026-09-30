import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/logger.js';

function fakeSink() {
  const calls = [];
  return {
    calls,
    log: (...args) => calls.push(['log', ...args]),
    warn: (...args) => calls.push(['warn', ...args]),
    error: (...args) => calls.push(['error', ...args]),
  };
}

test('info level drops debug and keeps the rest', () => {
  const sink = fakeSink();
  const log = createLogger({ level: 'info', sink });
  log.debug('d');
  log.info('i');
  log.warn('w');
  log.error('e');
  assert.deepEqual(sink.calls, [
    ['log', 'i'],
    ['warn', 'w'],
    ['error', 'e'],
  ]);
});

test('debug level keeps everything', () => {
  const sink = fakeSink();
  createLogger({ level: 'debug', sink }).debug('d', 1);
  assert.deepEqual(sink.calls, [['log', 'd', 1]]);
});

test('silent level drops everything', () => {
  const sink = fakeSink();
  const log = createLogger({ level: 'silent', sink });
  log.info('i');
  log.error('e');
  assert.deepEqual(sink.calls, []);
});

test('an unknown level behaves like info', () => {
  const sink = fakeSink();
  const log = createLogger({ level: 'chatty', sink });
  log.debug('d');
  log.info('i');
  assert.deepEqual(sink.calls, [['log', 'i']]);
});
