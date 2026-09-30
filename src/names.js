// Display-name lookups for users and channels, cached in memory.
// Shared by the event handlers and search so a busy channel doesn't cost an API call per message.

const DEFAULT_TTL_MS = 10 * 60 * 1000; // names change rarely; ten minutes is fresh enough

export function createNameCache({ ttlMs = DEFAULT_TTL_MS, now = Date.now } = {}) {
  const users = new Map();
  const channels = new Map();

  // Failed lookups fall back to the id and are not cached, so the next call retries.
  async function cached(map, id, fetch) {
    const hit = map.get(id);
    if (hit && hit.expires > now()) return hit.name;
    try {
      const name = (await fetch()) || id;
      map.set(id, { name, expires: now() + ttlMs });
      return name;
    } catch {
      return id;
    }
  }

  return {
    async userName(client, id) {
      if (!id) return 'unknown';
      return cached(users, id, async () => {
        const res = await client.users.info({ user: id });
        return res.user?.profile?.display_name || res.user?.real_name || res.user?.name;
      });
    },
    async channelName(client, id) {
      return cached(channels, id, async () => {
        const res = await client.conversations.info({ channel: id });
        return res.channel?.name;
      });
    },
  };
}

const shared = createNameCache();
export const userName = shared.userName;
export const channelName = shared.channelName;
