// Shared Block Kit builders — used by /decisions slash command and App Home.

import { truncate, quote, defuseMentions } from './text.js';

export const STATUS_META = {
  active: { emoji: '🟢', label: 'Active' },
  revisited: { emoji: '🟡', label: 'Revisiting' },
  reversed: { emoji: '🔴', label: 'Reversed' },
};

export function statusMeta(status) {
  return STATUS_META[status] || { emoji: '⚪', label: status };
}

function slackDate(ms) {
  const unix = Math.floor((ms || Date.now()) / 1000);
  return `<!date^${unix}^{date_short_pretty}|recently>`;
}

// One decision → a section block (+ context) for the list view.
function decisionItem(d) {
  const { emoji, label } = statusMeta(d.status);
  const preview = defuseMentions(truncate(d.text, 220));

  const section = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${emoji} *#${d.id}* — *${label}*\n${preview}`,
    },
  };
  if (d.permalink) {
    section.accessory = {
      type: 'button',
      text: { type: 'plain_text', text: 'Show me', emoji: true },
      url: d.permalink,
      action_id: `view_source_${d.id}`,
    };
  }

  const context = {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `By *${d.author_name || 'unknown'}* in *#${d.channel_name || '?'}* · ${slackDate(d.created_at)}`,
      },
    ],
  };

  return [section, context];
}

// Slack rejects a message with more than 50 blocks and a Home view with more than 100.
export const MESSAGE_BLOCK_LIMIT = 50;
export const HOME_BLOCK_LIMIT = 100;

const LEDGER_HEADER_BLOCKS = 3; // header, summary, divider
const BLOCKS_PER_DECISION = 3; // section, context, divider
const LEDGER_FOOTER_BLOCKS = 1; // "showing N of M" (its divider is the last decision's)

// How many decisions fit in a ledger view of the given block limit.
export function maxLedgerItems(blockLimit) {
  return Math.floor((blockLimit - LEDGER_HEADER_BLOCKS - LEDGER_FOOTER_BLOCKS) / BLOCKS_PER_DECISION);
}

// One-line summary under the ledger header.
function ledgerSummary(decisions, status, query) {
  const n = decisions.length;
  if (query) {
    const q = truncate(query, 80);
    return n === 0 ? `Nothing in the ledger matches “${q}”.` : `${n} match${n === 1 ? '' : 'es'} for “${q}”`;
  }
  if (status) {
    const label = statusMeta(status).label.toLowerCase();
    return n === 0 ? `No ${label} decisions right now.` : `${n} ${label} decision${n === 1 ? '' : 's'}`;
  }
  if (n === 0) return "Nothing saved yet — I'm ready whenever you are.";
  return `I'm holding onto ${n} decision${n === 1 ? '' : 's'} · ${statusBreakdown(decisions)}`;
}

// "🟢 3 active · 🟡 1 revisiting" — statuses with no decisions are left out.
export function statusBreakdown(decisions) {
  const counts = {};
  for (const d of decisions) counts[d.status] = (counts[d.status] || 0) + 1;
  return Object.keys(STATUS_META)
    .filter((status) => counts[status])
    .map((status) => `${STATUS_META[status].emoji} ${counts[status]} ${STATUS_META[status].label.toLowerCase()}`)
    .join(' · ');
}

// Full ledger view (header + all decisions). Used by both surfaces.
// Pass { status } or { query } when the list was filtered, so the title and empty state say so.
// blockLimit is the surface's cap; longer ledgers are cut to the most recent that fit.
export function ledgerBlocks(decisions, { title, status, query, blockLimit = MESSAGE_BLOCK_LIMIT } = {}) {
  const heading =
    title ||
    (query ? 'Search Results' : status ? `${statusMeta(status).label} Decisions` : 'Everything I Remember');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📚 ${heading}`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: ledgerSummary(decisions, status, query) }] },
    { type: 'divider' },
  ];

  if (decisions.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: status || query
          ? 'Run `/decisions` to see everything in the ledger.'
          : "React 📌 on any message and I'll remember it for the whole team.",
      },
    });
    return blocks;
  }

  const shown = decisions.slice(0, maxLedgerItems(blockLimit));
  shown.forEach((d, i) => {
    blocks.push(...decisionItem(d));
    if (i < shown.length - 1) blocks.push({ type: 'divider' });
  });

  if (shown.length < decisions.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Showing the ${shown.length} most recent of ${decisions.length}. Narrow it down with \`/decisions search <words>\` or a status.`,
        },
      ],
    });
  }

  return blocks;
}

// ---- /decisions help --------------------------------------------------------

// usage: [[command, description], ...]
export function helpBlocks(usage) {
  return [
    { type: 'header', text: { type: 'plain_text', text: '📚 Using /decisions', emoji: true } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: usage.map(([command, description]) => `\`${command}\` — ${description}`).join('\n'),
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'React 📌 on a message to save it, or mention me with a question to recall one.',
        },
      ],
    },
  ];
}

// ---- single decision --------------------------------------------------------

// Full view of one decision. history: rows from getHistory(), oldest first.
export function decisionDetail({ decision, history = [] }) {
  const { emoji, label } = statusMeta(decision.status);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `Decision #${decision.id}`, emoji: true } },
    {
      type: 'section',
      // section text is limited to 3000 characters
      text: { type: 'mrkdwn', text: `${emoji} *${label}*\n${quote(defuseMentions(truncate(decision.text, 2800)))}` },
      ...(decision.permalink
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'Show me', emoji: true },
              url: decision.permalink,
              action_id: `view_source_${decision.id}`,
            },
          }
        : {}),
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `By *${decision.author_name || 'unknown'}* in *#${decision.channel_name || '?'}* · saved ${slackDate(decision.created_at)} by *${decision.captured_by || 'unknown'}*`,
        },
      ],
    },
  ];

  if (history.length) {
    const lines = history.map((e) => {
      const from = statusMeta(e.from_status).label;
      const to = statusMeta(e.to_status);
      return `${to.emoji} ${from} → *${to.label}* by ${e.actor || 'someone'} · ${slackDate(e.created_at)}`;
    });
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*History*\n${lines.join('\n')}` } });
  }

  return blocks;
}

// ---- /decisions stats -------------------------------------------------------

// stats: the object returned by ledgerStats()
export function statsBlocks(stats) {
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: '📊 Ledger Stats', emoji: true } }];

  if (stats.total === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: "Nothing saved yet — React 📌 on a message and I'll start counting." },
    });
    return blocks;
  }

  const statusLines = Object.keys(STATUS_META).map(
    (status) => `${STATUS_META[status].emoji} ${STATUS_META[status].label}: *${stats.byStatus[status] || 0}*`,
  );
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${stats.total}* decision${stats.total === 1 ? '' : 's'} saved\n${statusLines.join('\n')}`,
    },
  });

  const ranked = (rows, prefix) => rows.map((r) => `${prefix}${r.name} — ${r.count}`).join('\n');
  const fields = [];
  if (stats.topAuthors.length) {
    fields.push({ type: 'mrkdwn', text: `*Most decisions by*\n${ranked(stats.topAuthors, '')}` });
  }
  if (stats.topChannels.length) {
    fields.push({ type: 'mrkdwn', text: `*Busiest channels*\n${ranked(stats.topChannels, '#')}` });
  }
  if (fields.length) blocks.push({ type: 'section', fields });

  return blocks;
}

// ---- status change ----------------------------------------------------------

// Reply to /decisions reverse|revisit|reopen. previous is the status before the command.
export function statusChanged({ decision, previous, byName }) {
  const { emoji, label } = statusMeta(decision.status);
  const headline =
    previous === decision.status
      ? `${emoji} *Decision #${decision.id} was already ${label.toLowerCase()}.*`
      : `${emoji} *Decision #${decision.id} is now ${label.toLowerCase()}* (was ${statusMeta(previous).label.toLowerCase()})`;
  return [
    { type: 'section', text: { type: 'mrkdwn', text: headline } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: quote(defuseMentions(truncate(decision.text, 240))) },
      ...(decision.permalink
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'Show me', emoji: true },
              url: decision.permalink,
              action_id: `view_source_${decision.id}`,
            },
          }
        : {}),
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `By *${decision.author_name || 'unknown'}* in *#${decision.channel_name || '?'}* · changed by *${byName}*`,
        },
      ],
    },
  ];
}

// ---- GUARDIAN warning -------------------------------------------------------

export function guardianWarning({ decision, confidence, explanation }) {
  const { emoji, label } = statusMeta(decision.status);
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *Hold on — I think we already settled this.*`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${defuseMentions(explanation) || 'This looks like it reverses an earlier call.'} · confidence ${(confidence * 100).toFixed(0)}%` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Decision #${decision.id}* (${label})\n${quote(defuseMentions(truncate(decision.text, 240)))}`,
      },
      ...(decision.permalink
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'Show me', emoji: true },
              url: decision.permalink,
              action_id: `guardian_view_${decision.id}`,
            },
          }
        : {}),
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `You made this call, *${decision.author_name}*, over in *#${decision.channel_name}*` },
      ],
    },
    {
      type: 'actions',
      block_id: `guardian_actions_${decision.id}`,
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: 'Still stands', emoji: true },
          action_id: 'guardian_stands',
          value: String(decision.id),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'We’re rethinking it', emoji: true },
          action_id: 'guardian_revisit',
          value: String(decision.id),
        },
      ],
    },
  ];
  return blocks;
}

// Warning card after a button is pressed — actions replaced by a resolution line.
export function guardianResolved({ decision, resolution, byName }) {
  const { emoji, label } = statusMeta(decision.status);
  const line =
    resolution === 'stands'
      ? `*${byName}* says this one still stands — noted, I'll keep it as is.`
      : `*${byName}* says we're rethinking this — I'll mark it as *revisiting*.`;
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *I flagged an earlier decision*` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Decision #${decision.id}* (${label})\n${quote(defuseMentions(truncate(decision.text, 240)))}`,
      },
      ...(decision.permalink
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'Show me', emoji: true },
              url: decision.permalink,
              action_id: `guardian_view_${decision.id}`,
            },
          }
        : {}),
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: line }] },
  ];
}

// ---- AUTO-CAPTURE prompt ----------------------------------------------------

// In-thread nudge asking whether a message should be remembered.
// value on Yes carries the original message ts + author so the save path matches reaction capture.
export function autocapturePrompt({ ts, authorId, statement }) {
  const quoted = statement ? `\n${quote(defuseMentions(truncate(statement, 240)))}` : '';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🤔 *Sounds like a decision* — want me to remember it?${quoted}`,
      },
    },
    {
      type: 'actions',
      block_id: `autocapture_actions_${ts}`,
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: 'Yes, save it', emoji: true },
          action_id: 'autocapture_yes',
          value: JSON.stringify({ ts, authorId }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'No', emoji: true },
          action_id: 'autocapture_no',
          value: ts,
        },
      ],
    },
  ];
}

// Confirmation card shown after saving — mirrors the reaction-capture confirmation.
export function captureConfirmation({ decision, created, capturedBy }) {
  const preview = decision.text.length > 200 ? decision.text.slice(0, 200) + '…' : decision.text;
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: created
          ? `📌 *Got it — I’ll remember this one.* (#${decision.id})`
          : `📌 *Already had this one saved.* (#${decision.id})`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `By *${decision.author_name}* in *#${decision.channel_name}* · saved by *${capturedBy}* · status *${decision.status}*`,
        },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: quote(defuseMentions(preview)) },
    },
  ];
}

// ---- RECALL card ------------------------------------------------------------

// result: {found, answer, reasoning, who, when, citations:[idx]}
// evidence: [{text, user_name/author_name, channel_name, permalink}]
export function recallCard({ question, result, evidence, source }) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🔎 Here’s What I Remember', emoji: true } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Q:* ${defuseMentions(truncate(question, 300))}` }],
    },
    { type: 'divider' },
  ];

  if (!result.found) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `I looked back but couldn't piece together a confident answer.\n${defuseMentions(result.answer || result.reasoning) || "I don't have a matching decision in the ledger or recent history."}`,
      },
    });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Looked through \`${source}\` · ${evidence.length} messages` }],
    });
    return blocks;
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Here’s the call:* ${defuseMentions(result.answer)}` },
  });
  if (result.reasoning) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*How I know:* ${defuseMentions(result.reasoning)}` },
    });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `*Who:* ${defuseMentions(result.who)}  ·  *When:* ${defuseMentions(result.when)}  ·  \`${source}\`` }],
  });

  const cited = result.citations
    .map((i) => evidence[i])
    .filter(Boolean);

  if (cited.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Receipts I'm going on (${cited.length})*` }],
    });
    for (const e of cited) {
      const author = e.user_name || e.author_name || 'unknown';
      const item = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${quote(defuseMentions(truncate(e.text, 220)))}\n_— ${author} in #${e.channel_name || '?'}_`,
        },
      };
      if (e.permalink) {
        item.accessory = {
          type: 'button',
          text: { type: 'plain_text', text: 'Open', emoji: true },
          url: e.permalink,
          action_id: `open_evidence_${Math.random().toString(36).slice(2, 8)}`,
        };
      }
      blocks.push(item);
    }
  }

  return blocks;
}
