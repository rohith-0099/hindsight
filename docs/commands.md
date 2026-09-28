# Using Hindsight

## Saving a decision

React with 📌 on any message in a channel Hindsight is in. It replies in the thread to confirm and gives the decision a number. Reacting twice does nothing new — a message is only ever saved once.

When auto-capture is on, Hindsight also offers to save messages that read like a decision. Press **Yes, save it** or **No**; it will not ask again for the same message.

## Asking what was decided

Mention the bot with a question:

```
@Hindsight what database did we choose?
```

The reply names the decision, who made it, and quotes the messages it is based on with a link to each. If nothing in the ledger or recent history answers the question, it says so rather than guessing.

## The ledger: `/decisions`

| Command | Shows |
| --- | --- |
| `/decisions` | Everything in the ledger, newest first |
| `/decisions active` | Decisions that currently stand |
| `/decisions revisiting` | Decisions the team has reopened |
| `/decisions reversed` | Decisions that were overturned |
| `/decisions search <words>` | Decisions mentioning every word (text, author or channel) |
| `/decisions help` | A reminder of the above |

Replies are visible only to you. A reply holds at most 15 decisions; when there are more, the newest are shown and a footer says how many were left out. Use `search` or a status to narrow it down.

The same ledger is on the **Home** tab of the Hindsight app, which holds up to 32.

## Statuses

| Status | Meaning |
| --- | --- |
| 🟢 Active | The decision stands. |
| 🟡 Revisiting | Someone has reopened the question. |
| 🔴 Reversed | The decision was overturned. The guardian stops checking against it. |

## When Hindsight interrupts

If a new message proposes the opposite of an active decision, Hindsight replies in the thread with the original decision and two buttons:

- **Still stands** — keeps the decision active.
- **We're rethinking it** — marks it as revisiting.
