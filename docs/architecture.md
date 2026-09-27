# Architecture

Hindsight is a single Node.js process. It talks to Slack over Socket Mode, keeps its ledger in a local SQLite file, and calls Groq for the three places where judgement is needed.

```
Slack  ──Socket Mode──▶  src/app.js  ──▶  src/db.js      (SQLite ledger)
                            │
                            ├──▶  src/search.js  (find evidence in Slack)
                            ├──▶  src/llm.js     (Groq: recall, guardian, auto-capture)
                            └──▶  src/blocks.js  (Block Kit builders)
```

## Modules

| File | Responsibility |
| --- | --- |
| `src/app.js` | Bolt app, event and action handlers, wiring. |
| `src/db.js` | Schema and queries for the decision ledger. |
| `src/search.js` | Evidence search: Slack's `assistant.search.context` when available, otherwise a sweep of recent channel history scored by token overlap. |
| `src/llm.js` | Prompts and response parsing for the three LLM calls. |
| `src/blocks.js` | Pure functions that build Block Kit payloads. |
| `scripts/seed.js` | Posts sample conversations and pre-loads decisions for demos. |

## Flows

### Capture

`reaction_added` with 📌 → fetch the message text and permalink → `saveDecision` (idempotent on channel + message timestamp) → confirmation in the message's thread.

### Recall

`app_mention` → search the workspace for the question → merge with the ledger (ledger entries win on duplicate permalinks) → `reconstructDecision` asks the model for an answer with citation indices → `recallCard` renders the answer and the cited messages.

Citation indices returned by the model are filtered against the evidence list, so a hallucinated index can never render a card pointing at nothing.

### Guardian

Every channel message goes through a cheap lexical filter first: only decisions sharing at least two significant tokens with the message become candidates. No candidates means no LLM call. Candidates go to `checkConflict`; a warning is posted only when the model reports a conflict with confidence of 0.85 or higher.

### Auto-capture

Runs after the guardian, and only if the guardian stayed quiet. A message must contain a decision cue ("decided", "going with", "final call", ...) before `classifyDecision` is called. Each message is prompted at most once; the prompt is recorded before it is posted so a retry cannot double-post.

## Design choices

- **Conservative by default.** Both the guardian and auto-capture prefer missing a case over interrupting the channel wrongly.
- **Lexical filter before LLM.** Most messages never reach the model, which keeps cost and latency down.
- **SQLite.** One file, no server, WAL mode. Enough for a single workspace.
