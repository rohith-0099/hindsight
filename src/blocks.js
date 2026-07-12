// Shared Block Kit builders — used by /decisions slash command and App Home.

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

function truncate(s, n) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
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
      text: { type: 'plain_text', text: 'View source', emoji: true },
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

// Full ledger view (header + all decisions). Used by both surfaces.
export function ledgerBlocks(decisions, { title = 'Decision Ledger' } = {}) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `📚 ${title}`, emoji: true } },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text:
            decisions.length === 0
              ? 'No decisions captured yet.'
              : `${decisions.length} decision${decisions.length === 1 ? '' : 's'} · 🟢 active · 🟡 revisiting · 🔴 reversed`,
        },
      ],
    },
    { type: 'divider' },
  ];

  if (decisions.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'React with 📌 on any message to capture it as a team decision.',
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

// ---- GUARDIAN warning -------------------------------------------------------

export function guardianWarning({ decision, confidence, explanation }) {
  const { emoji, label } = statusMeta(decision.status);
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *This may contradict a past decision.*`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${explanation || 'Possible reversal detected.'} · confidence ${(confidence * 100).toFixed(0)}%` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Decision #${decision.id}* (${label})\n> ${truncate(decision.text, 240).replace(/\n/g, '\n> ')}`,
      },
      ...(decision.permalink
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'View decision', emoji: true },
              url: decision.permalink,
              action_id: `guardian_view_${decision.id}`,
            },
          }
        : {}),
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Originally by *${decision.author_name}* in *#${decision.channel_name}*` },
      ],
    },
    {
      type: 'actions',
      block_id: `guardian_actions_${decision.id}`,
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: '✅ Decision stands', emoji: true },
          action_id: 'guardian_stands',
          value: String(decision.id),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🟡 We’re revisiting this', emoji: true },
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
      ? `✅ *${byName}* confirmed the decision stands.`
      : `🟡 *${byName}* marked this decision as *revisiting*.`;
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *Past decision flagged*` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Decision #${decision.id}* (${label})\n> ${truncate(decision.text, 240).replace(/\n/g, '\n> ')}`,
      },
      ...(decision.permalink
        ? {
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'View decision', emoji: true },
              url: decision.permalink,
              action_id: `guardian_view_${decision.id}`,
            },
          }
        : {}),
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: line }] },
  ];
}

// ---- RECALL card ------------------------------------------------------------

// result: {found, answer, reasoning, who, when, citations:[idx]}
// evidence: [{text, user_name/author_name, channel_name, permalink}]
export function recallCard({ question, result, evidence, source }) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🔎 Hindsight Recall', emoji: true } },
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
        text: `I couldn't reconstruct a confident answer.\n${result.answer || result.reasoning || 'No matching decision found in the ledger or recent history.'}`,
      },
    });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Searched via \`${source}\` · ${evidence.length} candidate messages` }],
    });
    return blocks;
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Decision:* ${result.answer}` },
  });
  if (result.reasoning) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Why:* ${result.reasoning}` },
    });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `👤 *Who:* ${result.who}  ·  🗓️ *When:* ${result.when}  ·  🔍 \`${source}\`` }],
  });

  const cited = result.citations
    .map((i) => evidence[i])
    .filter(Boolean);

  if (cited.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Cited evidence (${cited.length})*` }],
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
