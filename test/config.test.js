import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, missingEnv } from '../src/config.js';

test('loadConfig applies defaults', () => {
  const c = loadConfig({});
  assert.equal(c.groqModel, 'openai/gpt-oss-120b');
  assert.equal(c.dbPath, 'data/hindsight.sqlite');
  assert.equal(c.autocapture, true);
});

test('AUTOCAPTURE=off disables auto-capture, case-insensitively', () => {
  assert.equal(loadConfig({ AUTOCAPTURE: 'off' }).autocapture, false);
  assert.equal(loadConfig({ AUTOCAPTURE: 'OFF' }).autocapture, false);
  assert.equal(loadConfig({ AUTOCAPTURE: 'on' }).autocapture, true);
});

test('missingEnv lists unset and blank variables', () => {
  assert.deepEqual(missingEnv({ SLACK_BOT_TOKEN: 'x', SLACK_APP_TOKEN: '  ' }), [
    'SLACK_APP_TOKEN',
    'GROQ_API_KEY',
  ]);
});

test('missingEnv is empty when everything is set', () => {
  assert.deepEqual(missingEnv({ SLACK_BOT_TOKEN: 'a', SLACK_APP_TOKEN: 'b', GROQ_API_KEY: 'c' }), []);
});

test('confidence thresholds can be overridden', () => {
  const c = loadConfig({ GUARDIAN_MIN_CONFIDENCE: '0.9', AUTOCAPTURE_MIN_CONFIDENCE: '0.7' });
  assert.equal(c.guardianMinConfidence, 0.9);
  assert.equal(c.autocaptureMinConfidence, 0.7);
});

test('invalid thresholds fall back to defaults', () => {
  const c = loadConfig({ GUARDIAN_MIN_CONFIDENCE: 'high', AUTOCAPTURE_MIN_CONFIDENCE: '1.5' });
  assert.equal(c.guardianMinConfidence, 0.85);
  assert.equal(c.autocaptureMinConfidence, 0.8);
});
