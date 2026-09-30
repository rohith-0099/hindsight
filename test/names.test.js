import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNameCache } from '../src/names.js';

// Fake Slack client that counts calls and can be told to fail.
function fakeClient({ fail = false } = {}) {
  const client = {
    calls: 0,
    fail,
    users: {
      info: async ({ user }) => {
        client.calls += 1;
        if (client.fail) throw new Error('user_not_found');
        return { user: { profile: { display_name: `name-of-${user}` } } };
      },
    },
    conversations: {
      info: async ({ channel }) => {
        client.calls += 1;
        if (client.fail) throw new Error('channel_not_found');
        return { channel: { name: `name-of-${channel}` } };
      },
    },
  };
  return client;
}

test('userName looks a user up once and then serves from cache', async () => {
  const names = createNameCache();
  const client = fakeClient();
  assert.equal(await names.userName(client, 'U1'), 'name-of-U1');
  assert.equal(await names.userName(client, 'U1'), 'name-of-U1');
  assert.equal(client.calls, 1);
});

test('userName without an id is "unknown" and makes no call', async () => {
  const names = createNameCache();
  const client = fakeClient();
  assert.equal(await names.userName(client, null), 'unknown');
  assert.equal(client.calls, 0);
});

test('channelName is cached separately from users', async () => {
  const names = createNameCache();
  const client = fakeClient();
  assert.equal(await names.channelName(client, 'C1'), 'name-of-C1');
  assert.equal(await names.channelName(client, 'C1'), 'name-of-C1');
  assert.equal(client.calls, 1);
});

test('entries expire after the TTL', async () => {
  let clock = 0;
  const names = createNameCache({ ttlMs: 1000, now: () => clock });
  const client = fakeClient();
  await names.userName(client, 'U1');
  clock = 999;
  await names.userName(client, 'U1');
  assert.equal(client.calls, 1);
  clock = 1000;
  await names.userName(client, 'U1');
  assert.equal(client.calls, 2);
});

test('a failed lookup falls back to the id and is retried next time', async () => {
  const names = createNameCache();
  const client = fakeClient({ fail: true });
  assert.equal(await names.userName(client, 'U1'), 'U1');
  client.fail = false;
  assert.equal(await names.userName(client, 'U1'), 'name-of-U1');
  assert.equal(client.calls, 2);
});
