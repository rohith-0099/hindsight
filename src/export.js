// Render the ledger for use outside Slack (wiki page, backup, spreadsheet import).

import { statusMeta } from './blocks.js';

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

// Slack link markup → Markdown: <https://x.dev|docs> → [docs](https://x.dev)
function slackLinksToMarkdown(text) {
  return (text || '')
    .replace(/<(https?:[^>|]+)\|([^>]+)>/g, '[$2]($1)')
    .replace(/<(https?:[^>|]+)>/g, '$1');
}

export function toMarkdown(decisions, { generatedAt = Date.now() } = {}) {
  const n = decisions.length;
  const lines = ['# Decision ledger', '', `_${n} decision${n === 1 ? '' : 's'} · exported ${isoDate(generatedAt)}_`];

  for (const d of decisions) {
    const quoted = slackLinksToMarkdown(d.text)
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    lines.push('', `## #${d.id} — ${statusMeta(d.status).label}`, '', quoted, '');
    lines.push(`- **By:** ${d.author_name || 'unknown'} in #${d.channel_name || '?'}`);
    lines.push(`- **Saved:** ${isoDate(d.created_at)}${d.captured_by ? ` by ${d.captured_by}` : ''}`);
    if (d.permalink) lines.push(`- **Source:** ${d.permalink}`);
  }

  return lines.join('\n') + '\n';
}

export function toJSON(decisions) {
  const rows = decisions.map((d) => ({
    id: d.id,
    status: d.status,
    text: d.text,
    author: d.author_name || null,
    channel: d.channel_name || null,
    permalink: d.permalink || null,
    captured_by: d.captured_by || null,
    created_at: new Date(d.created_at).toISOString(),
    updated_at: new Date(d.updated_at).toISOString(),
  }));
  return JSON.stringify(rows, null, 2) + '\n';
}
