# Slack app setup

Hindsight runs in Socket Mode, so it needs no public URL.

## 1. Create the app

1. Go to <https://api.slack.com/apps> and create a new app from scratch.
2. Under **Socket Mode**, enable it.
3. Under **Basic Information → App-Level Tokens**, create a token with the `connections:write` scope. This is `SLACK_APP_TOKEN` (starts with `xapp-`).

## 2. Bot token scopes

Add these under **OAuth & Permissions → Bot Token Scopes**:

| Scope | Used for |
| --- | --- |
| `app_mentions:read` | Recall questions (`@Hindsight ...`) |
| `channels:history` | Reading message text for capture, guardian and recall |
| `channels:read` | Resolving channel names, listing channels the bot is in |
| `chat:write` | Posting replies and cards |
| `chat:write.customize` | Seed script only — posting as sample personas |
| `commands` | The `/decisions` slash command |
| `reactions:read` | 📌 capture |
| `users:read` | Resolving display names |

Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-`) into `SLACK_BOT_TOKEN`.

## 3. Event subscriptions

Under **Event Subscriptions**, subscribe to these bot events:

- `app_home_opened`
- `app_mention`
- `message.channels`
- `reaction_added`

## 4. Slash command

Under **Slash Commands**, create `/decisions`. With Socket Mode on, no request URL is needed.

## 5. App Home

Under **App Home**, enable the **Home Tab**.

## 6. Invite the bot

Hindsight only sees channels it is a member of:

```
/invite @Hindsight
```
