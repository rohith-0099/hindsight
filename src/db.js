import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

const DB_PATH = config.dbPath;
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    author_id   TEXT,
    author_name TEXT,
    channel_id  TEXT,
    channel_name TEXT,
    message_ts  TEXT,
    permalink   TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    captured_by TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    UNIQUE(channel_id, message_ts)
  );
`);

// AUTO-CAPTURE: remember which messages we've already offered to save,
// so we never prompt twice for the same message ts. Isolated from decisions.
db.exec(`
  CREATE TABLE IF NOT EXISTS autocapture_prompts (
    channel_id TEXT NOT NULL,
    message_ts TEXT NOT NULL,
    author_id  TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, message_ts)
  );
`);

// Status history: one row each time a decision moves from one status to another.
db.exec(`
  CREATE TABLE IF NOT EXISTS decision_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id INTEGER NOT NULL REFERENCES decisions(id),
    from_status TEXT NOT NULL,
    to_status   TEXT NOT NULL,
    actor       TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS decision_events_by_decision ON decision_events(decision_id);
`);

export function saveDecision(d) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO decisions
      (text, author_id, author_name, channel_id, channel_name, message_ts, permalink, status, captured_by, created_at, updated_at)
    VALUES
      (@text, @author_id, @author_name, @channel_id, @channel_name, @message_ts, @permalink, 'active', @captured_by, @now, @now)
    ON CONFLICT(channel_id, message_ts) DO NOTHING
  `);
  const info = stmt.run({ ...d, now });
  if (info.changes === 0) {
    // already captured — return existing row
    const existing = db
      .prepare('SELECT * FROM decisions WHERE channel_id = ? AND message_ts = ?')
      .get(d.channel_id, d.message_ts);
    return { created: false, decision: existing };
  }
  const decision = db.prepare('SELECT * FROM decisions WHERE id = ?').get(info.lastInsertRowid);
  return { created: true, decision };
}

export const STATUSES = ['active', 'revisited', 'reversed'];

// Newest first. Pass { status } to keep only one status.
export function listDecisions({ status } = {}) {
  if (status) {
    return db
      .prepare('SELECT * FROM decisions WHERE status = ? ORDER BY created_at DESC, id DESC')
      .all(status);
  }
  return db.prepare('SELECT * FROM decisions ORDER BY created_at DESC, id DESC').all();
}

// Keyword search over decision text, author and channel. Every word must match.
export function searchDecisions(query) {
  const terms = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const haystack = "lower(text || ' ' || coalesce(author_name, '') || ' ' || coalesce(channel_name, ''))";
  const where = terms.map(() => `${haystack} LIKE ? ESCAPE '\\'`).join(' AND ');
  // escape LIKE wildcards so "100%" or "snake_case" match literally
  const params = terms.map((t) => `%${t.replace(/[\\%_]/g, '\\$&')}%`);

  return db
    .prepare(`SELECT * FROM decisions WHERE ${where} ORDER BY created_at DESC, id DESC`)
    .all(...params);
}

export function getDecision(id) {
  return db.prepare('SELECT * FROM decisions WHERE id = ?').get(id);
}

// Ledger totals for /decisions stats.
// Returns { total, byStatus: {active, revisited, reversed}, topAuthors, topChannels }
// where the top lists are [{ name, count }], largest first, at most `top` entries.
export function ledgerStats({ top = 3 } = {}) {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) AS count FROM decisions GROUP BY status').all()) {
    byStatus[row.status] = row.count;
  }

  const topBy = (column) =>
    db
      .prepare(
        `SELECT ${column} AS name, COUNT(*) AS count FROM decisions
         WHERE ${column} IS NOT NULL AND ${column} != ''
         GROUP BY ${column} ORDER BY count DESC, name ASC LIMIT ?`,
      )
      .all(top);

  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus,
    topAuthors: topBy('author_name'),
    topChannels: topBy('channel_name'),
  };
}

// AUTO-CAPTURE helpers -------------------------------------------------------

export function hasDecision(channel_id, message_ts) {
  return !!db
    .prepare('SELECT 1 FROM decisions WHERE channel_id = ? AND message_ts = ?')
    .get(channel_id, message_ts);
}

export function wasPrompted(channel_id, message_ts) {
  return !!db
    .prepare('SELECT 1 FROM autocapture_prompts WHERE channel_id = ? AND message_ts = ?')
    .get(channel_id, message_ts);
}

export function markPrompted(channel_id, message_ts, author_id) {
  db.prepare(
    'INSERT OR IGNORE INTO autocapture_prompts (channel_id, message_ts, author_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(channel_id, message_ts, author_id || null, Date.now());
}

// Returns the updated decision, or undefined when there is no decision with that id.
// actor is the display name of whoever made the change; it is kept in the history.
export function setStatus(id, status, actor = null) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);

  const current = getDecision(id);
  if (!current) return undefined;
  if (current.status === status) return current; // nothing changed, nothing to record

  const now = Date.now();
  db.transaction(() => {
    db.prepare('UPDATE decisions SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    db.prepare(
      'INSERT INTO decision_events (decision_id, from_status, to_status, actor, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, current.status, status, actor, now);
  })();
  return getDecision(id);
}

// Status changes for one decision, oldest first.
export function getHistory(id) {
  return db
    .prepare('SELECT * FROM decision_events WHERE decision_id = ? ORDER BY created_at ASC, id ASC')
    .all(id);
}

export default db;
