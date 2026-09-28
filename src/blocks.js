// Shared Block Kit builders — used by /decisions slash command and App Home.

import { truncate, quote } from './text.js';

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
  const preview = truncate(d.text, 220);

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
export function ledgerBlocks(decisions, { title, status, query } = {}) {
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

  decisions.forEach((d, i) => {
    blocks.push(...decisionItem(d));
    if (i < decisions.length - 1) blocks.push({ type: 'divider' });
  });

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
        { type: 'mrkdwn', text: `${explanation || 'This looks like it reverses an earlier call.'} · confidence ${(confidence * 100).toFixed(0)}%` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Decision #${decision.id}* (${label})\n${quote(truncate(decision.text, 240))}`,
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
        text: `${emoji} *Decision #${decision.id}* (${label})\n${quote(truncate(decision.text, 240))}`,
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
  const quoted = statement ? `\n${quote(truncate(statement, 240))}` : '';
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
      text: { type: 'mrkdwn', text: quote(preview) },
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
      elements: [{ type: 'mrkdwn', text: `*Q:* ${truncate(question, 300)}` }],
    },
    { type: 'divider' },
  ];

  if (!result.found) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `I looked back but couldn't piece together a confident answer.\n${result.answer || result.reasoning || "I don't have a matching decision in the ledger or recent history."}`,
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
    text: { type: 'mrkdwn', text: `*Here’s the call:* ${result.answer}` },
  });
  if (result.reasoning) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*How I know:* ${result.reasoning}` },
    });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `*Who:* ${result.who}  ·  *When:* ${result.when}  ·  \`${source}\`` }],
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
          text: `> ${truncate(e.text, 220)}\n_— ${author} in #${e.channel_name || '?'}_`,
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
