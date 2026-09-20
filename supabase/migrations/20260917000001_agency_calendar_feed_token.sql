-- Kalender-Feed pro Agentur: Token für die ICS-Abo-URL (Kunde verbindet seinen Kalender)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS calendar_feed_token TEXT UNIQUE;
UPDATE agencies SET calendar_feed_token = encode(gen_random_bytes(16), 'hex') WHERE calendar_feed_token IS NULL;
ALTER TABLE agencies ALTER COLUMN calendar_feed_token SET DEFAULT encode(gen_random_bytes(16), 'hex');
