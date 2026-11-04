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

-- Blog comments (members' go live; everyone else's need approved = 1)
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  post_id TEXT NOT NULL,
  name TEXT NOT NULL,
  comment TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  reply TEXT,
  member INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, approved, created_at);

-- Members (free: name + email). Only a hash of each device key is stored.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  updates INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS member_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE
);

-- MEMBERS
-- All members:          SELECT id, name, email, updates, created_at FROM members ORDER BY created_at DESC;
-- Want post emails:     SELECT name, email FROM members WHERE updates = 1 AND status = 'active';
-- Block a member:       UPDATE members SET status = 'blocked' WHERE email = 'person@example.com';
-- Delete on request:    DELETE FROM member_keys WHERE member_id = (SELECT id FROM members WHERE email = 'person@example.com');
--                       DELETE FROM members WHERE email = 'person@example.com';

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

-- Community stories (Nutrition, My Day, Four Burners, Science). Email is private.
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  page TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  story TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1,
  member INTEGER NOT NULL DEFAULT 0
);
-- STORIES
-- All stories:          SELECT id, page, name, email, story, approved FROM testimonials ORDER BY created_at DESC;
-- Held (had a link):    SELECT id, page, name, story FROM testimonials WHERE approved = 0;
-- Approve one:          UPDATE testimonials SET approved = 1 WHERE id = 1;
-- Hide one:             UPDATE testimonials SET approved = 0 WHERE id = 1;
-- Delete one:           DELETE FROM testimonials WHERE id = 1;

-- Field Ready fitness dashboard (/fitness/). One encrypted copy; only a hash of the sync token is stored.
CREATE TABLE IF NOT EXISTS fitness_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash TEXT NOT NULL,
  data TEXT,
  updated_at TEXT
);

-- Passcode gate for /fitness/. Salted hash only; the passcode is not stored.
CREATE TABLE IF NOT EXISTS fitness_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  secret TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);
