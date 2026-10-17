-- Searchable mail summary filled at ingest; the Worker backfills existing rows.
ALTER TABLE raw_mails ADD COLUMN subject TEXT;
ALTER TABLE raw_mails ADD COLUMN attachment_count INTEGER;
