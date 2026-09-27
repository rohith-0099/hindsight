# Hindsight

Hindsight is a Slack agent that remembers what your team decided, so nobody has to scroll back through months of threads to find out.

It captures decisions as they happen, answers "what did we decide about X?" with links to the original messages, and speaks up when a new message contradicts something the team already settled.

## Features

- **Capture** — react with 📌 on any message and it is saved to the decision ledger.
- **Ledger** — `/decisions` or the App Home tab lists everything saved, with status and a link back to the source message.
- **Recall** — mention `@Hindsight` with a question and get an answer that cites the messages it is based on.
- **Guardian** — when a new message reverses a recorded decision, Hindsight replies in-thread and asks whether the decision still stands or is being revisited.
- **Auto-capture** — messages that read like a decision ("final call: Postgres") get a quiet in-thread offer to save them.

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
