// Parser for the text after the /decisions slash command.
// Pure: turns a string into an { action, ... } object that app.js acts on.

// Words a user may type for each stored status.
export const STATUS_WORDS = {
  active: 'active',
  revisiting: 'revisited',
  revisited: 'revisited',
  reversed: 'reversed',
};

// Shown by /decisions help. Kept next to the parser so the two stay in sync.
export const USAGE = [
  ['/decisions', 'Everything in the ledger, newest first'],
  ['/decisions active | revisiting | reversed', 'Only decisions with that status'],
  ['/decisions search <words>', 'Decisions mentioning every word'],
  ['/decisions reverse <id>', 'Mark a decision as overturned'],
  ['/decisions revisit <id>', 'Mark a decision as being rethought'],
  ['/decisions reopen <id>', 'Put a decision back to active'],
  ['/decisions help', 'This message'],
];

// Verbs that move a decision to a status: /decisions reverse 12
export const STATUS_VERBS = {
  reverse: 'reversed',
  revisit: 'revisited',
  reopen: 'active',
};

// "12" or "#12" → 12; anything else → null
function parseId(word) {
  const m = /^#?(\d+)$/.exec(word || '');
  return m ? Number(m[1]) : null;
}

export function parseCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { action: 'list' };

  const [head, ...rest] = trimmed.split(/\s+/);
  const word = head.toLowerCase();

  if (word === 'help' || word === '?') return { action: 'help' };

  if (STATUS_WORDS[word] && rest.length === 0) {
    return { action: 'list', status: STATUS_WORDS[word] };
  }

  if (STATUS_VERBS[word]) {
    const id = rest.length === 1 ? parseId(rest[0]) : null;
    if (id == null) {
      return { action: 'error', message: `Which decision? Give me its number — e.g. \`/decisions ${word} 12\`.` };
    }
    return { action: 'status', id, status: STATUS_VERBS[word] };
  }

  if (word === 'search' || word === 'find') {
    const query = rest.join(' ');
    if (!query) return { action: 'error', message: 'Tell me what to look for — e.g. `/decisions search postgres`.' };
    return { action: 'search', query };
  }

  return { action: 'error', message: `I don't know \`${trimmed}\`. Try \`/decisions help\`.` };
}
