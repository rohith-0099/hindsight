// Search layer for RECALL.
//   Primary : RTS assistant.search.context (may be unavailable on free plans)
//   Fallback: conversations.history sweep across channels the bot is in
// Returns { source, results:[{text,user_name,channel_name,ts,permalink,score}] }

import { log } from './logger.js';

const STOPWORDS = new Set(
  'the a an and or but of to in on for with we our us you it is are was were be been being this that these those do did does have has had will would should could can may our i me my what when who why how which about over vs versus decide decided decision hindsight'.split(
    /\s+/,
  ),
);

export function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function scoreText(queryTokens, text) {
  if (!text) return 0;
  const t = new Set(tokenize(text));
  let score = 0;
  for (const q of queryTokens) if (t.has(q)) score += 1;
  return score;
}

// The `limit` items sharing the most significant words with the query; ties keep
// their original order. Nothing is dropped when everything already fits.
export function mostRelevant(items, query, { limit, text = (item) => item.text } = {}) {
  if (items.length <= limit) return items;
  const queryTokens = [...new Set(tokenize(query))];
  return items
    .map((item, index) => ({ item, index, score: scoreText(queryTokens, text(item)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}

// ---- name caches ------------------------------------------------------------

const userCache = new Map();
async function userName(client, id) {
  if (!id) return 'unknown';
  if (userCache.has(id)) return userCache.get(id);
  let name = id;
  try {
    const r = await client.users.info({ user: id });
    name = r.user?.profile?.display_name || r.user?.real_name || r.user?.name || id;
  } catch {}
  userCache.set(id, name);
  return name;
}

// ---- primary: RTS -----------------------------------------------------------

async function tryRTS(client, query, limit) {
  try {
    const res = await client.apiCall('assistant.search.context', {
      query,
      limit,
    });
    if (!res.ok) return null;
    const msgs = res.results?.messages || res.messages || [];
    if (!msgs.length) return null;
    return msgs.map((m) => ({
      text: m.text || m.content || '',
      user_name: m.author_user_name || m.username || m.user || 'unknown',
      channel_name: m.channel_name || m.channel?.name || '?',
      ts: m.ts || m.message_ts || '',
      permalink: m.permalink || null,
      score: 1,
    }));
  } catch (e) {
    log.debug('[search] RTS unavailable:', e.data?.error || e.message);
    return null;
  }
}

// ---- fallback: conversations.history sweep ---------------------------------

async function historySweep(client, query, limit) {
  const queryTokens = [...new Set(tokenize(query))];

  let channels = [];
  try {
    const r = await client.users.conversations({
      types: 'public_channel',
      exclude_archived: true,
      limit: 200,
    });
    channels = r.channels || [];
  } catch (e) {
    log.error('[search] users.conversations failed:', e.data?.error || e.message);
    return [];
  }

  const scored = [];
  for (const ch of channels) {
    let msgs = [];
    try {
      const r = await client.conversations.history({ channel: ch.id, limit: 100 });
      msgs = r.messages || [];
    } catch (e) {
      // not a member / no access — skip
      continue;
    }
    for (const m of msgs) {
      if (!m.text || m.subtype) continue;
      const score = scoreText(queryTokens, m.text);
      if (score <= 0) continue;
      scored.push({
        text: m.text,
        user_id: m.user,
        channel_id: ch.id,
        channel_name: ch.name,
        ts: m.ts,
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || Number(b.ts) - Number(a.ts));
  const top = scored.slice(0, limit);

  // enrich top results with permalink + author name
  await Promise.all(
    top.map(async (r) => {
      r.user_name = await userName(client, r.user_id);
      try {
        const p = await client.chat.getPermalink({ channel: r.channel_id, message_ts: r.ts });
        r.permalink = p.permalink;
      } catch {
        r.permalink = null;
      }
    }),
  );

  return top;
}

export async function searchWorkspace(client, query, { limit = 12 } = {}) {
  const rts = await tryRTS(client, query, limit);
  if (rts && rts.length) return { source: 'assistant.search.context', results: rts };
  const results = await historySweep(client, query, limit);
  return { source: 'conversations.history', results };
}
