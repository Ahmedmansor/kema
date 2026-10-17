CREATE TABLE IF NOT EXISTS kema_state (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  updated_at TEXT
);
INSERT OR IGNORE INTO kema_state(id) VALUES ('main');
CREATE TABLE IF NOT EXISTS kema_history (
  revision INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT
);
