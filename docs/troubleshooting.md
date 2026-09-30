# Troubleshooting

Set `LOG_LEVEL=debug` first. At that level Hindsight also logs the messages it looked at and decided to skip, which answers most "why didn't it do anything?" questions.

## The bot exits immediately

**`Missing required environment variables: ...`** — `.env` is missing or incomplete. Copy `.env.example` to `.env` and fill in the three tokens. See [configuration.md](configuration.md).

**`Could not connect to Slack: invalid_auth`** — one of the Slack tokens is wrong. `SLACK_BOT_TOKEN` starts with `xoxb-` and comes from **OAuth & Permissions**; `SLACK_APP_TOKEN` starts with `xapp-` and comes from **Basic Information → App-Level Tokens**. They are easy to swap.

## 📌 does nothing

- The bot must be a member of the channel: `/invite @Hindsight`.
- The app needs the `reaction_added` event and the `reactions:read` scope. After adding a scope, reinstall the app to the workspace.
- Only the 📌 (`:pushpin:`) emoji counts. `:round_pushpin:` is a different emoji.

## The confirmation says "(message text unavailable)"

Hindsight could not read the message. It needs `channels:history`, and it has to be in the channel. Private channels and DMs are not supported.

## `/decisions` fails with `dispatch_failed`

The slash command exists in the app config but the bot is not running, or Socket Mode is off.

## `@Hindsight` answers "I hit a snag"

The recall call to Groq failed. Check the log for the reason. Common causes:

- `GROQ_API_KEY` is invalid or out of quota.
- `GROQ_MODEL` names a model that has been retired. The default is `openai/gpt-oss-120b`.

## The guardian never speaks up

It is conservative by design. All of these must be true:

1. The message is at least 15 characters and is not from a bot.
2. It shares at least two significant words with a saved decision that is not reversed.
3. The model reports a contradiction with confidence at or above `GUARDIAN_MIN_CONFIDENCE` (0.85).

A line starting `[llm] checkConflict failed` in the log means the model call itself is failing — see the Groq causes above.

## Auto-capture never offers to save anything

- `AUTOCAPTURE` must not be `off`.
- Only top-level channel messages are considered, not thread replies.
- The message must contain a cue such as "decided", "agreed", "going with", "final call", "settled on" or "locked in".
- A message is only ever prompted once, and not at all if the guardian already replied to it.

## The Home tab is empty or stale

Enable **Home Tab** under **App Home** and subscribe to the `app_home_opened` event. The tab refreshes when it is opened and after you capture or change a decision.

## Starting over

Stop the bot and delete the database file (`data/hindsight.sqlite` and its `-wal` / `-shm` companions). It is recreated empty on the next start. Old guardian buttons in Slack will then reply that the decision is no longer saved.
