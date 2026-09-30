# Hindsight

[![test](https://github.com/rohith-0099/hindsight/actions/workflows/test.yml/badge.svg)](https://github.com/rohith-0099/hindsight/actions/workflows/test.yml)

Hindsight is a Slack agent that remembers what your team decided, so nobody has to scroll back through months of threads to find out.

It captures decisions as they happen, answers "what did we decide about X?" with links to the original messages, and speaks up when a new message contradicts something the team already settled.

## Features

- **Capture** — react with 📌 on any message and it is saved to the decision ledger.
- **Ledger** — `/decisions` or the App Home tab lists everything saved, with status and a link back to the source message.
- **Recall** — mention `@Hindsight` with a question and get an answer that cites the messages it is based on.
- **Guardian** — when a new message reverses a recorded decision, Hindsight replies in-thread and asks whether the decision still stands or is being revisited.
- **Auto-capture** — messages that read like a decision ("final call: Postgres") get a quiet in-thread offer to save them.

## Usage

| Do this | To |
| --- | --- |
| React 📌 on a message | Save it as a decision |
| `@Hindsight what did we decide about X?` | Get an answer with links to the source messages |
| `/decisions` | See the whole ledger |
| `/decisions active` \| `revisiting` \| `reversed` | Filter the ledger by status |
| `/decisions search <words>` | Find decisions by keyword |
| `/decisions show <id>` | See one decision in full, with its status history |
| `/decisions reverse` \| `revisit` \| `reopen <id>` | Change a decision's status |
| `/decisions stats` | See counts by status, top authors and channels |
| `npm run export` | Write the ledger out as Markdown or JSON |

More in [docs/commands.md](docs/commands.md).

## Quick start

Requires Node.js 20 or newer.

```bash
git clone https://github.com/rohith-0099/hindsight.git
cd hindsight
npm install
cp .env.example .env   # then fill in the three tokens
npm start
```

You need a Slack app running in Socket Mode and a Groq API key. See [docs/slack-setup.md](docs/slack-setup.md) for the scopes and events to enable.

To try it with realistic sample history, create `#architecture`, `#product` and `#engineering`, invite the bot to each, then run:

```bash
npm run seed
```

## Documentation

- [Slack app setup](docs/slack-setup.md) — scopes, events, slash command
- [Configuration](docs/configuration.md) — environment variables and tuning
- [Using Hindsight](docs/commands.md) — capture, recall and every `/decisions` command
- [Architecture](docs/architecture.md) — modules, flows and design choices
- [Data model](docs/data-model.md) — tables, export and backups
- [Troubleshooting](docs/troubleshooting.md)

## Project layout

```
src/
  app.js        Bolt app and handlers
  blocks.js     Block Kit builders
  commands.js   /decisions argument parser
  config.js     environment settings
  db.js         SQLite ledger and status history
  export.js     Markdown / JSON renderers
  llm.js        Groq prompts
  logger.js     levelled logging
  names.js      cached user and channel names
  preflight.js  startup environment check
  search.js     evidence search
  text.js       text helpers
scripts/
  seed.js       sample data for demos
  export.js     ledger export
test/           node:test suite
docs/           guides
```

## Development

```bash
npm test
```

The suite needs no Slack or Groq tokens. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
