CREATE TABLE IF NOT EXISTS kema_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL COLLATE NOCASE,
  personal_email TEXT UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kema_profile_members (
  profile_id TEXT NOT NULL REFERENCES kema_profiles(id),
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
  PRIMARY KEY(profile_id,email)
);
CREATE TABLE IF NOT EXISTS kema_profile_state (
  profile_id TEXT PRIMARY KEY REFERENCES kema_profiles(id),
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS kema_profile_history (
  profile_id TEXT NOT NULL REFERENCES kema_profiles(id),
  revision INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY(profile_id,revision)
);
