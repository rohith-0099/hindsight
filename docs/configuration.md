# Configuration

All configuration is read from environment variables. Copy `.env.example` to `.env` and fill it in.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SLACK_BOT_TOKEN` | yes | — | Bot token (`xoxb-`). |
| `SLACK_APP_TOKEN` | yes | — | App-level token (`xapp-`) with `connections:write`. |
| `GROQ_API_KEY` | yes | — | Groq API key, from <https://console.groq.com/keys>. |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` | Model used for recall, guardian and auto-capture. |
| `DB_PATH` | no | `data/hindsight.sqlite` | SQLite file. The directory is created if missing. |
| `AUTOCAPTURE` | no | `on` | Set to `off` to disable the "sounds like a decision" prompt. |

## Tuning

Two confidence thresholds live in `src/app.js`:

- `GUARDIAN_MIN_CONFIDENCE` (0.85) — minimum model confidence before the guardian posts a warning.
- `AUTOCAPTURE_MIN_CONFIDENCE` (0.8) — minimum confidence before offering to save a message.

Both are deliberately conservative: a missed decision is cheaper than a bot that interrupts for no reason.
