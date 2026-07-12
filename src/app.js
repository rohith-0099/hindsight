import 'dotenv/config';
import pkg from '@slack/bolt';
const { App } = pkg;

import { saveDecision, listDecisions } from './db.js';
import { ledgerBlocks, recallCard } from './blocks.js';
import { searchWorkspace } from './search.js';
import { reconstructDecision } from './llm.js';

const CAPTURE_EMOJI = 'pushpin'; // 📌

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// ---- helpers ----------------------------------------------------------------

async function fetchMessageText(client, channel, ts) {
  try {
    const res = await client.conversations.history({
      channel,
      latest: ts,
      oldest: ts,
      inclusive: true,
      limit: 1,
    });
    return res.messages?.[0]?.text || '';
  } catch (e) {
    console.error('fetchMessageText failed:', e.data?.error || e.message);
    return '';
  }
}

async function resolveName(client, userId) {
  if (!userId) return 'unknown';
  try {
    const res = await client.users.info({ user: userId });
    return res.user?.profile?.display_name || res.user?.real_name || res.user?.name || userId;
  } catch {
    return userId;
  }
}

async function resolveChannelName(client, channelId) {
  try {
    const res = await client.conversations.info({ channel: channelId });
    return res.channel?.name || channelId;
  } catch {
    return channelId;
  }
}

// ---- FEATURE 1: CAPTURE -----------------------------------------------------

app.event('reaction_added', async ({ event, client }) => {
  if (event.reaction !== CAPTURE_EMOJI) return;
  if (event.item.type !== 'message') return;

  const channel = event.item.channel;
  const ts = event.item.ts;

  const [text, permalinkRes] = await Promise.all([
    fetchMessageText(client, channel, ts),
    client.chat.getPermalink({ channel, message_ts: ts }).catch(() => null),
  ]);

  const authorId = event.item_user || null;
  const [authorName, channelName] = await Promise.all([
    resolveName(client, authorId),
    resolveChannelName(client, channel),
  ]);

  const capturedBy = await resolveName(client, event.user);

  const { created, decision } = saveDecision({
    text: text || '(message text unavailable)',
    author_id: authorId,
    author_name: authorName,
    channel_id: channel,
    channel_name: channelName,
    message_ts: ts,
    permalink: permalinkRes?.permalink || null,
    captured_by: capturedBy,
  });

  const preview = decision.text.length > 200 ? decision.text.slice(0, 200) + '…' : decision.text;

  await client.chat.postMessage({
    channel,
    thread_ts: ts,
    text: created ? '📌 Decision captured' : '📌 Already captured',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: created
            ? `📌 *Decision captured* (#${decision.id})`
            : `📌 *Already in the ledger* (#${decision.id})`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `By *${decision.author_name}* in *#${decision.channel_name}* · captured by *${capturedBy}* · status *${decision.status}*`,
          },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${preview.replace(/\n/g, '\n> ')}` },
      },
    ],
  });

  console.log(`[capture] #${decision.id} ${created ? 'new' : 'dup'} in #${channelName}`);

  // keep the capturer's Home tab fresh
  publishHome(client, event.user).catch(() => {});
});

// ---- FEATURE 2: LEDGER ------------------------------------------------------

// /decisions slash command → ephemeral Block Kit list
app.command('/decisions', async ({ ack, respond }) => {
  await ack();
  const decisions = listDecisions();
  await respond({
    response_type: 'ephemeral',
    blocks: ledgerBlocks(decisions),
    text: `${decisions.length} decisions in the ledger`,
  });
});

// App Home tab → published Block Kit list
async function publishHome(client, userId) {
  const decisions = listDecisions().slice(0, 40); // Home tab block limit safety
  await client.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks: ledgerBlocks(decisions),
    },
  });
}

app.event('app_home_opened', async ({ event, client }) => {
  if (event.tab && event.tab !== 'home') return;
  try {
    await publishHome(client, event.user);
  } catch (e) {
    console.error('publishHome failed:', e.data?.error || e.message);
  }
});

// Acknowledge source-link button clicks (they're URL buttons; no server action needed)
app.action(/^view_source_\d+$/, async ({ ack }) => {
  await ack();
});

// ---- FEATURE 3: RECALL ------------------------------------------------------

// Ledger rows → evidence shape (so saved decisions are citable with links)
function ledgerAsEvidence(ledger) {
  return ledger.map((d) => ({
    text: d.text,
    user_name: d.author_name,
    channel_name: d.channel_name,
    permalink: d.permalink,
    ts: d.message_ts,
    _ledger_id: d.id,
  }));
}

// dedup by permalink (ledger item wins over searched dup)
function mergeEvidence(ledgerEv, searchEv) {
  const seen = new Set(ledgerEv.map((e) => e.permalink).filter(Boolean));
  const extra = searchEv.filter((e) => !e.permalink || !seen.has(e.permalink));
  return [...ledgerEv, ...extra];
}

app.event('app_mention', async ({ event, client }) => {
  const question = event.text.replace(/<@[^>]+>/g, '').trim();
  const thread_ts = event.thread_ts || event.ts;

  if (!question) {
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts,
      text: 'Ask me about a past decision, e.g. `@Hindsight what database did we choose?`',
    });
    return;
  }

  // quick ack so the user knows we're working
  const thinking = await client.chat.postMessage({
    channel: event.channel,
    thread_ts,
    text: '🔎 Searching the ledger and workspace…',
  });

  try {
    const ledger = listDecisions();
    const { source, results } = await searchWorkspace(client, question);
    const evidence = mergeEvidence(ledgerAsEvidence(ledger), results);

    const result = await reconstructDecision({ question, ledger, evidence });

    await client.chat.update({
      channel: event.channel,
      ts: thinking.ts,
      text: result.answer || 'Hindsight recall',
      blocks: recallCard({ question, result, evidence, source }),
    });
    console.log(`[recall] "${question.slice(0, 40)}" via ${source}, ${results.length} hits, found=${result.found}`);
  } catch (e) {
    console.error('[recall] failed:', e.data?.error || e.message);
    await client.chat.update({
      channel: event.channel,
      ts: thinking.ts,
      text: 'Recall failed.',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `⚠️ Recall failed: \`${e.data?.error || e.message}\`` } },
      ],
    });
  }
});

// Acknowledge evidence-link button clicks (URL buttons)
app.action(/^open_evidence_/, async ({ ack }) => {
  await ack();
});

// ---- boot -------------------------------------------------------------------

(async () => {
  await app.start();
  console.log('⚡ Hindsight is running (Socket Mode)');
})();
