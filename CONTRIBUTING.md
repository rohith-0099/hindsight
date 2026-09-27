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
npm test       # run the test suite
```

## Tests

Tests use Node's built-in runner (`node --test`) and live in `test/`. They cover the pure parts of the code: tokenising, text helpers, config parsing. Nothing in the suite calls Slack or Groq, so it runs without any tokens.

When adding logic, prefer putting it in a function that takes plain values and returns plain values, then test that.

## Code style

- ES modules, two-space indent, single quotes, semicolons.
- Block Kit payloads are built in `src/blocks.js`, not inline in handlers.
- Environment variables are read in `src/config.js` only.

## Commits

Use a short prefix describing the kind of change: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
