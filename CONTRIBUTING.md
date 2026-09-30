# Contributing

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` as described in [docs/configuration.md](docs/configuration.md). Use a test Slack workspace — the seed script posts messages.

## Running

```bash
npm start      # run the bot
npm run seed   # post sample history into channels the bot is in
npm run export # write the ledger as Markdown or JSON
npm test       # run the test suite
```

## Tests

Tests use Node's built-in runner (`node --test`) and live in `test/`. Nothing in the suite calls Slack or Groq, so it runs without any tokens.

| File | Covers |
| --- | --- |
| `blocks.test.js` | Block Kit builders, including Slack's block and text limits |
| `commands.test.js` | `/decisions` argument parsing |
| `config.test.js` | Environment parsing and defaults |
| `db.test.js`, `stats.test.js` | Ledger queries, against an in-memory SQLite database |
| `export.test.js` | Markdown and JSON export |
| `logger.test.js` | Log level filtering |
| `names.test.js` | Name cache, with a fake Slack client |
| `search.test.js` | Tokenising and relevance ranking |
| `text.test.js` | Truncating, quoting, defusing mentions |

Database tests set `DB_PATH=:memory:` before importing `src/db.js`. Each test file runs in its own process, so each gets its own empty database.

When adding logic, prefer putting it in a function that takes plain values and returns plain values, then test that. The handlers in `src/app.js` are not covered; keep them thin.

## Code style

- ES modules, two-space indent, single quotes, semicolons.
- Block Kit payloads are built in `src/blocks.js`, not inline in handlers.
- Environment variables are read in `src/config.js` only.
- Log through `src/logger.js`, not `console`, outside of `scripts/`.
- Text quoted back into Slack goes through `defuseMentions` so it cannot ping a channel.

## Commits

Use a short prefix describing the kind of change: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
