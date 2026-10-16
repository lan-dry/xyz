-- Originals live only in the encrypted vault. content_display keeps the member's
-- text with placeholders (no attachment extracts) and is rehydrated on read.

UPDATE stoa_message
SET content_display = split_part(content, E'\n\n[Attachment: ', 1)
WHERE role = 'user';

COMMENT ON COLUMN stoa_message.content_display IS 'Member text with placeholders, without attachment extracts. Originals are restored from redaction_vault on read.';
