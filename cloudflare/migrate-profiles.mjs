// Additive, idempotent migration. The legacy tables remain a recovery copy.
export function legacyProfileMigration(owner){return [
  {sql:`INSERT OR IGNORE INTO kema_profiles(id,name,owner_email,created_at) SELECT 'family-main',COALESCE(json_extract(data,'$.profile.name'),'الملف العائلي'),?,COALESCE(updated_at,datetime('now')) FROM kema_state WHERE id='main'`,params:[owner.toLowerCase()]},
  {sql:`INSERT OR IGNORE INTO kema_profile_state(profile_id,revision,data,updated_at) SELECT 'family-main',revision,data,updated_at FROM kema_state WHERE id='main'`,params:[]},
  {sql:`INSERT OR IGNORE INTO kema_profile_history(profile_id,revision,data,updated_at) SELECT 'family-main',revision,data,updated_at FROM kema_history`,params:[]},
  {sql:`INSERT OR IGNORE INTO kema_profile_members(profile_id,email,role) SELECT 'family-main',email,role FROM kema_roles WHERE lower(email)<>?`,params:[owner.toLowerCase()]}
];}
