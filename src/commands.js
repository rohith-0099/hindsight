// Parser for the text after the /decisions slash command.
// Pure: turns a string into an { action, ... } object that app.js acts on.

// Words a user may type for each stored status.
export const STATUS_WORDS = {
  active: 'active',
  revisiting: 'revisited',
  revisited: 'revisited',
  reversed: 'reversed',
};

export function parseCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { action: 'list' };

  const [head, ...rest] = trimmed.split(/\s+/);
  const word = head.toLowerCase();

  if (STATUS_WORDS[word] && rest.length === 0) {
    return { action: 'list', status: STATUS_WORDS[word] };
  }

  return { action: 'error', message: `I don't know \`${trimmed}\`.` };
}
