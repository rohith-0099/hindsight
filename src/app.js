import './preflight.js'; // must stay first: exits before other modules load if env is incomplete
import { config } from './config.js';
import pkg from '@slack/bolt';
const { App } = pkg;

import db, {
  saveDecision,
  listDecisions,
  searchDecisions,
  ledgerStats,
  getDecision,
  getHistory,
  setStatus,
  hasDecision,
  wasPrompted,
  markPrompted,
} from './db.js';
import {
  ledgerBlocks,
  helpBlocks,
  statusChanged,
  decisionDetail,
  statsBlocks,
  HOME_BLOCK_LIMIT,
  recallCard,
  guardianWarning,
  guardianResolved,
  autocapturePrompt,
  captureConfirmation,
} from './blocks.js';
import { searchWorkspace, tokenize, mostRelevant } from './search.js';
import { parseCommand, USAGE } from './commands.js';
import { log } from './logger.js';
import { userName, channelName } from './names.js';
import { reconstructDecision, checkConflict, classifyDecision } from './llm.js';

const CAPTURE_EMOJI = 'pushpin'; // 📌

// Recall sends ledger entries to the model; past this many, only the most relevant go.
const RECALL_LEDGER_LIMIT = 40;

// Cheap lexical pre-filter — no LLM call unless a decision-verb phrase is present.
const DECISION_CUES = [
  'decided',
  'agreed',
  'going with',
  "we'll use",
  'we will use',
  'final call',
  'settled on',
  "let's go with",
  'locked in',
];
function looksLikeDecision(text) {
  const t = text.toLowerCase();
  return DECISION_CUES.some((cue) => t.includes(cue));
}

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
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
    log.error('fetchMessageText failed:', e.data?.error || e.message);
    return '';
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
    userName(client, authorId),
    channelName(client, channel),
  ]);

  const capturedBy = await userName(client, event.user);

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

  await client.chat.postMessage({
    channel,
    thread_ts: ts,
    text: created ? '📌 Got it — I’ll remember this' : '📌 Already got this one',
    blocks: captureConfirmation({ decision, created, capturedBy }),
  });

  log.info(`[capture] #${decision.id} ${created ? 'new' : 'dup'} in #${channelName}`);

  // keep the capturer's Home tab fresh
  publishHome(client, event.user).catch(() => {});
});

// ---- FEATURE 2: LEDGER ------------------------------------------------------

// /decisions slash command → ephemeral Block Kit list
//   /decisions            everything
//   /decisions <status>   only active | revisiting | reversed
//   /decisions search <q> keyword search over the ledger
//   /decisions show <id>  one decision in full, with history
//   /decisions reverse|revisit|reopen <id>   change a decision's status
//   /decisions stats      counts by status, top authors and channels
//   /decisions help       usage
app.command('/decisions', async ({ ack, respond, command, client }) => {
  await ack();
  const cmd = parseCommand(command.text);

  if (cmd.action === 'error') {
    await respond({ response_type: 'ephemeral', text: cmd.message });
    return;
  }

  if (cmd.action === 'help') {
    await respond({ response_type: 'ephemeral', blocks: helpBlocks(USAGE), text: 'Using /decisions' });
    return;
  }

  if (cmd.action === 'stats') {
    await respond({ response_type: 'ephemeral', blocks: statsBlocks(ledgerStats()), text: 'Ledger stats' });
    return;
  }

  if (cmd.action === 'show') {
    const decision = getDecision(cmd.id);
    if (!decision) {
      await respond({ response_type: 'ephemeral', text: `I don't have a decision #${cmd.id}.` });
      return;
    }
    await respond({
      response_type: 'ephemeral',
      blocks: decisionDetail({ decision, history: getHistory(cmd.id) }),
      text: `Decision #${decision.id}`,
    });
    return;
  }

  if (cmd.action === 'status') {
    const before = getDecision(cmd.id);
    if (!before) {
      await respond({ response_type: 'ephemeral', text: `I don't have a decision #${cmd.id}.` });
      return;
    }
    const byName = await userName(client, command.user_id);
    const decision = setStatus(cmd.id, cmd.status, byName);
    await respond({
      response_type: 'ephemeral',
      blocks: statusChanged({ decision, previous: before.status, byName }),
      text: `Decision #${decision.id} is ${decision.status}`,
    });
    publishHome(client, command.user_id).catch(() => {});
    return;
  }

  if (cmd.action === 'search') {
    const matches = searchDecisions(cmd.query);
    await respond({
      response_type: 'ephemeral',
      blocks: ledgerBlocks(matches, { query: cmd.query }),
      text: `${matches.length} decisions matching "${cmd.query}"`,
    });
    return;
  }

  const decisions = listDecisions({ status: cmd.status });
  await respond({
    response_type: 'ephemeral',
    blocks: ledgerBlocks(decisions, { status: cmd.status }),
    text: `${decisions.length} decisions in the ledger`,
  });
});

// App Home tab → published Block Kit list
async function publishHome(client, userId) {
  await client.views.publish({
    user_id: userId,
    view: {
      type: 'home',
      blocks: ledgerBlocks(listDecisions(), { blockLimit: HOME_BLOCK_LIMIT }),
    },
  });
}

app.event('app_home_opened', async ({ event, client }) => {
  if (event.tab && event.tab !== 'home') return;
  try {
    await publishHome(client, event.user);
  } catch (e) {
    log.error('publishHome failed:', e.data?.error || e.message);
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
      text: 'Ask me anything we’ve decided before — e.g. `@Hindsight what database did we choose?`',
    });
    return;
  }

  // quick ack so the user knows we're working
  const thinking = await client.chat.postMessage({
    channel: event.channel,
    thread_ts,
    text: '🔎 Let me think back through what we’ve decided…',
  });

  try {
    const ledger = mostRelevant(listDecisions(), question, { limit: RECALL_LEDGER_LIMIT });
    const { source, results } = await searchWorkspace(client, question);
    const evidence = mergeEvidence(ledgerAsEvidence(ledger), results);

    const result = await reconstructDecision({ question, ledger, evidence });

    await client.chat.update({
      channel: event.channel,
      ts: thinking.ts,
      text: result.answer || 'Hindsight recall',
      blocks: recallCard({ question, result, evidence, source }),
    });
    log.info(`[recall] "${question.slice(0, 40)}" via ${source}, ${results.length} hits, found=${result.found}`);
  } catch (e) {
    log.error('[recall] failed:', e.data?.error || e.message);
    await client.chat.update({
      channel: event.channel,
      ts: thinking.ts,
      text: 'I hit a snag trying to remember.',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `⚠️ Sorry — I hit a snag digging that up. Give me another try in a moment.` } },
      ],
    });
  }
});

// Acknowledge evidence-link button clicks (URL buttons)
app.action(/^open_evidence_/, async ({ ack }) => {
  await ack();
});

// ---- FEATURE 4: GUARDIAN ----------------------------------------------------

// lexical pre-filter: candidate decisions sharing >=2 significant tokens
function candidateDecisions(text) {
  const msgTokens = new Set(tokenize(text));
  if (msgTokens.size === 0) return [];
  return listDecisions()
    .filter((d) => d.status !== 'reversed' && d.message_ts) // ignore reversed
    .map((d) => {
      let overlap = 0;
      for (const t of new Set(tokenize(d.text))) if (msgTokens.has(t)) overlap += 1;
      return { d, overlap };
    })
    .filter((x) => x.overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5)
    .map((x) => x.d);
}

// Guardian conflict check. Returns true if it posted a warning (i.e. it "fired").
// Logic unchanged from the original handler — only wrapped to report whether it fired.
async function guardianCheck({ message, client }) {
  const candidates = candidateDecisions(message.text);
  if (candidates.length === 0) return false; // no lexical overlap → no LLM call (cheap + conservative)

  // don't flag a decision's own source message
  if (candidates.some((d) => d.message_ts === message.ts)) return false;

  let verdict;
  try {
    verdict = await checkConflict({
      message: message.text,
      candidates: candidates.map((d) => ({ id: d.id, text: d.text, status: d.status })),
    });
  } catch (e) {
    log.error('[guardian] checkConflict failed:', e.message);
    return false;
  }

  if (!verdict.conflict || verdict.confidence < config.guardianMinConfidence) {
    if (verdict.conflict) log.debug(`[guardian] below threshold (${verdict.confidence}) — skipped`);
    return false;
  }

  const decision = getDecision(verdict.decision_id);
  if (!decision) return false;

  await client.chat.postMessage({
    channel: message.channel,
    thread_ts: message.thread_ts || message.ts,
    text: '⚠️ Hold on — I think we already settled this.',
    blocks: guardianWarning({
      decision,
      confidence: verdict.confidence,
      explanation: verdict.explanation,
    }),
  });
  log.info(`[guardian] flagged decision #${decision.id} conf=${verdict.confidence}`);
  return true;
}

// ---- FEATURE 5: AUTO-CAPTURE ------------------------------------------------

// If a top-level message looks like a fresh decision, quietly offer to remember it.
// Runs only after Guardian; a contradiction isn't a new decision, so we skip those.
async function autocaptureCheck({ message, guardianFired, client }) {
  const channel = message.channel;
  const ts = message.ts;

  if (guardianFired) {
    log.debug(`[autocapture] skipped-guardian #${ts}`);
    return;
  }
  if (message.thread_ts && message.thread_ts !== ts) return; // top-level channel messages only
  if (hasDecision(channel, ts)) return; // already 📌-captured
  if (wasPrompted(channel, ts)) return; // never prompt twice
  if (!looksLikeDecision(message.text)) return; // cheap lexical prefilter → no LLM call

  let verdict;
  try {
    verdict = await classifyDecision({ message: message.text });
  } catch (e) {
    log.error('[autocapture] classifyDecision failed:', e.message);
    return;
  }

  if (!verdict.is_decision || verdict.confidence < config.autocaptureMinConfidence) {
    log.debug(`[autocapture] below threshold (${verdict.confidence}) #${ts}`);
    return;
  }

  // record before posting so a retry never double-prompts the same ts
  markPrompted(channel, ts, message.user);

  await client.chat.postMessage({
    channel,
    thread_ts: ts,
    text: 'Sounds like a decision — want me to remember it?',
    blocks: autocapturePrompt({ ts, authorId: message.user, statement: verdict.statement }),
  });
  log.info(`[autocapture] prompted #${ts} conf=${verdict.confidence}`);
}

// Single channel-message listener: Guardian first, then auto-capture.
app.message(async ({ message, context, client }) => {
  // ignore edits, joins, bot messages, and the bot's own posts
  if (message.subtype || message.bot_id) return;
  if (!message.text || message.text.trim().length < 15) return;
  if (context.botUserId && message.text.includes(`<@${context.botUserId}>`)) return; // that's a recall mention

  const guardianFired = await guardianCheck({ message, client });

  if (config.autocapture) {
    await autocaptureCheck({ message, guardianFired, client });
  }
});

// Button: Yes, save it → same DB path as reaction capture (author = original author)
app.action('autocapture_yes', async ({ ack, body, action, client }) => {
  await ack();

  let payload;
  try {
    payload = JSON.parse(action.value);
  } catch {
    return;
  }
  const { ts, authorId } = payload;
  const channel = body.channel.id;

  const [text, permalinkRes] = await Promise.all([
    fetchMessageText(client, channel, ts),
    client.chat.getPermalink({ channel, message_ts: ts }).catch(() => null),
  ]);
  const [authorName, channelName, capturedBy] = await Promise.all([
    userName(client, authorId),
    channelName(client, channel),
    userName(client, body.user.id),
  ]);

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

  await client.chat.update({
    channel,
    ts: body.message.ts,
    text: created ? 'Got it — I’ll remember this one.' : 'Already had this one saved.',
    blocks: captureConfirmation({ decision, created, capturedBy }),
  });
  log.info(`[autocapture] saved #${decision.id} ${created ? 'new' : 'dup'}`);

  publishHome(client, body.user.id).catch(() => {});
});

// Button: No → dismiss (ts already recorded at prompt time, so we never re-ask)
app.action('autocapture_no', async ({ ack, body, client }) => {
  await ack();
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'No worries — I’ll leave this one.',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '👍 No worries — I’ll leave this one be.' },
      },
    ],
  });
});

// A guardian button was pressed for a decision that is no longer in the ledger
// (e.g. the database was reset). Replace the buttons so they can't be pressed again.
async function staleDecision(client, body) {
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'I no longer have that decision saved.',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: '🤷 I no longer have that decision saved.' } },
    ],
  });
}

// Button: decision stands → status active
app.action('guardian_stands', async ({ ack, body, action, client }) => {
  await ack();
  const id = Number(action.value);
  const byName = await userName(client, body.user.id);
  const decision = setStatus(id, 'active', byName);
  if (!decision) {
    await staleDecision(client, body);
    return;
  }
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'Good to know — I’ll keep it as is.',
    blocks: guardianResolved({ decision, resolution: 'stands', byName }),
  });
  publishHome(client, body.user.id).catch(() => {});
});

// Button: we're revisiting → status revisited
app.action('guardian_revisit', async ({ ack, body, action, client }) => {
  await ack();
  const id = Number(action.value);
  const byName = await userName(client, body.user.id);
  const decision = setStatus(id, 'revisited', byName);
  if (!decision) {
    await staleDecision(client, body);
    return;
  }
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: 'Got it — I’ll mark this as revisiting.',
    blocks: guardianResolved({ decision, resolution: 'revisit', byName }),
  });
  publishHome(client, body.user.id).catch(() => {});
});

// Acknowledge the URL "View decision" buttons
app.action(/^guardian_view_/, async ({ ack }) => {
  await ack();
});

// ---- boot -------------------------------------------------------------------

// Anything a handler throws ends up here instead of as an unhandled rejection.
app.error(async (error) => {
  log.error('[app] unhandled error:', error.code || '', error.original?.message || error.message);
});

// Close the socket and the database cleanly on Ctrl-C or a container stop.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log.info(`${signal} received — shutting down`);
  try {
    await app.stop();
  } catch (e) {
    log.error('[app] stop failed:', e.message);
  }
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

(async () => {
  try {
    await app.start();
  } catch (e) {
    const reason = e.data?.error || e.message;
    log.error(`Could not connect to Slack: ${reason}`);
    if (reason === 'invalid_auth' || reason === 'not_authed') {
      log.error('Check SLACK_BOT_TOKEN (xoxb-) and SLACK_APP_TOKEN (xapp-) — see docs/slack-setup.md');
    }
    process.exit(1);
  }
  log.info('⚡ Hindsight is running (Socket Mode)');
})();
