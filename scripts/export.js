// Write the ledger to stdout or a file.
//   Usage: node scripts/export.js [--format md|json] [--status active|revisited|reversed] [--out FILE]
// Reads the same database as the bot (DB_PATH); needs no Slack or Groq tokens.

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { listDecisions, STATUSES } from '../src/db.js';
import { toMarkdown, toJSON } from '../src/export.js';

const FORMATS = { md: toMarkdown, json: toJSON };

let args;
try {
  args = parseArgs({
    options: {
      format: { type: 'string', short: 'f', default: 'md' },
      status: { type: 'string', short: 's' },
      out: { type: 'string', short: 'o' },
    },
  }).values;
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

if (!FORMATS[args.format]) {
  console.error(`Unknown format "${args.format}". Use one of: ${Object.keys(FORMATS).join(', ')}`);
  process.exit(1);
}
if (args.status && !STATUSES.includes(args.status)) {
  console.error(`Unknown status "${args.status}". Use one of: ${STATUSES.join(', ')}`);
  process.exit(1);
}

const decisions = listDecisions({ status: args.status });
const output = FORMATS[args.format](decisions);

if (args.out) {
  writeFileSync(args.out, output);
  console.error(`Wrote ${decisions.length} decision${decisions.length === 1 ? '' : 's'} to ${args.out}`);
} else {
  process.stdout.write(output);
}
