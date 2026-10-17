CREATE TABLE IF NOT EXISTS kema_doctor_shares (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES kema_profiles(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
