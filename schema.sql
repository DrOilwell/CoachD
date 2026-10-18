-- Database: coachd-db (Cloudflare D1). Already created; kept here for reference.

-- Contact form messages
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

-- Blog comments (shown on the site only after approved = 1)
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  post_id TEXT NOT NULL,
  name TEXT NOT NULL,
  comment TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  reply TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, approved, created_at);

-- MESSAGES
-- See newest:          SELECT * FROM messages ORDER BY created_at DESC LIMIT 50;
-- Mark replied:        UPDATE messages SET status = 'replied' WHERE id = 1;
-- Delete on request:   DELETE FROM messages WHERE email = 'person@example.com';

-- COMMENTS
-- Waiting for review:  SELECT id, post_id, name, comment, created_at FROM comments WHERE approved = 0 ORDER BY created_at;
-- Approve one:         UPDATE comments SET approved = 1 WHERE id = 1;
-- Approve and reply:   UPDATE comments SET approved = 1, reply = 'Thanks! Great question.' WHERE id = 1;
-- Hide one again:      UPDATE comments SET approved = 0 WHERE id = 1;
-- Delete spam:         DELETE FROM comments WHERE id = 1;
