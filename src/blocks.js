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
