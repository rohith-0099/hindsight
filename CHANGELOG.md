# Changelog

## 0.2.0 — 2026-09-30

### Added

- `/decisions` takes arguments:
  - `active`, `revisiting`, `reversed` — filter by status
  - `search <words>` — keyword search over text, author and channel
  - `show <id>` — one decision in full, with its status history
  - `reverse <id>`, `revisit <id>`, `reopen <id>` — change a decision's status
  - `stats` — counts by status, top authors and channels
  - `help`
- Status history: every status change is recorded with who made it.
- `npm run export` writes the ledger as Markdown or JSON.
- Ledger header shows a per-status breakdown.
- `LOG_LEVEL`, `GUARDIAN_MIN_CONFIDENCE` and `AUTOCAPTURE_MIN_CONFIDENCE` environment variables.
- Startup check that names missing environment variables.
- Clean shutdown on SIGINT and SIGTERM.
- Test suite (`npm test`) and a CI workflow.
- README and a `docs/` folder.

### Fixed

- `/decisions` failed once the ledger passed 16 decisions, because the reply exceeded Slack's 50-block limit. The App Home tab had the same problem past 32.
- Quoting a saved message that contained `@channel` or `@here` notified the channel again.
- Guardian buttons threw when their decision was no longer in the database.
- Recall sent the entire ledger to the model on every question; it now sends at most the 40 most relevant entries.
- The history-sweep search only read the first page of the bot's channels.
- Guardian and auto-capture model failures were silent; they are now logged.
- A failed Slack connection printed a stack trace instead of the reason.
- `@slack/web-api` was used by the seed script without being declared as a dependency.
- Ledger order was not stable for decisions saved in the same millisecond.

### Changed

- Environment variables are read in one place (`src/config.js`).
- User and channel names are cached for ten minutes instead of being looked up on every event.
- Routine "skipped" log lines moved to debug level.

## 0.1.0 — 2026-07-13

- Capture decisions with a 📌 reaction.
- Ledger via `/decisions` and the App Home tab.
- Recall with cited evidence via `@Hindsight`.
- Guardian warning when a message contradicts a recorded decision.
- Auto-capture prompt for messages that read like a decision.
