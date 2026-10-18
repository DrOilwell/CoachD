-- Run once in Cloudflare: D1 > coachd-db > Console
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC);

-- Handy queries:
-- See newest messages:   SELECT * FROM messages ORDER BY created_at DESC LIMIT 50;
-- Mark one as replied:   UPDATE messages SET status = 'replied' WHERE id = 1;
-- Delete on request:     DELETE FROM messages WHERE email = 'person@example.com';
-- Clear old messages:    DELETE FROM messages WHERE created_at < datetime('now', '-12 months');
