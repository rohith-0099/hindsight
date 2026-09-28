// Small text helpers shared by the Block Kit builders.

// Collapse whitespace and cut to n characters with an ellipsis.
export function truncate(s, n) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// Render text as a Slack mrkdwn blockquote, keeping line breaks inside the quote.
export function quote(s) {
  return `> ${(s || '').replace(/\n/g, '\n> ')}`;
}

// Turn broadcast mentions into plain text so repeating a message never re-pings people.
//   <!channel> → @channel    <!subteam^S123|@backend> → @backend
export function defuseMentions(s) {
  return (s || '')
    .replace(/<!(channel|here|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<!subteam\^[^>|]*(?:\|([^>]*))?>/g, (_match, label) => label || '@group');
}
