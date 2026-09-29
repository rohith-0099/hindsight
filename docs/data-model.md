# Data model

Hindsight stores everything in one SQLite file (`DB_PATH`, default `data/hindsight.sqlite`). Tables are created on startup if they do not exist. The schema lives in `src/db.js`.

## `decisions`

The ledger. One row per saved message.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer | Primary key. The number shown as `#12` in Slack. |
| `text` | text | Message text as Slack returned it, including Slack markup. |
| `author_id` | text | Slack user ID of the message author. Null for seeded rows. |
| `author_name` | text | Display name at the time of capture. |
| `channel_id` | text | Slack channel ID. |
| `channel_name` | text | Channel name at the time of capture. |
| `message_ts` | text | Slack timestamp of the source message. |
| `permalink` | text | Link to the source message. Null if Slack would not give one. |
| `status` | text | `active`, `revisited` or `reversed`. Defaults to `active`. |
| `captured_by` | text | Display name of whoever saved it. |
| `created_at` | integer | Milliseconds since epoch. |
| `updated_at` | integer | Milliseconds since epoch; changes with the status. |

`(channel_id, message_ts)` is unique, which is what makes capture idempotent: saving the same message twice returns the existing row.

Names are stored as they were when the decision was captured. If someone renames a channel or changes their display name, existing rows keep the old value.

## `decision_events`

Status history. One row each time a decision moves from one status to another. Setting a decision to the status it already has records nothing.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer | Primary key. |
| `decision_id` | integer | References `decisions.id`. |
| `from_status` | text | Status before the change. |
| `to_status` | text | Status after the change. |
| `actor` | text | Display name of whoever made the change. May be null. |
| `created_at` | integer | Milliseconds since epoch. |

The status update and its event row are written in one transaction.

## `autocapture_prompts`

Messages Hindsight has already offered to save, so it never asks twice.

| Column | Type | Notes |
| --- | --- | --- |
| `channel_id` | text | Part of the primary key. |
| `message_ts` | text | Part of the primary key. |
| `author_id` | text | Author of the message. |
| `created_at` | integer | Milliseconds since epoch. |

## Exporting

```bash
npm run export                                  # Markdown to stdout
npm run export -- --format json --out ledger.json
npm run export -- --status active
```

The export reads the database directly and needs no Slack or Groq tokens.

## Backups

The database runs in WAL mode, so copying only the `.sqlite` file while the bot is running can miss recent writes. Either stop the bot first, or use SQLite's own backup:

```bash
sqlite3 data/hindsight.sqlite ".backup backup.sqlite"
```
