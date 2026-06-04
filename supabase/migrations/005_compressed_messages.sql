-- Add compressed flag to messages for context compression
ALTER TABLE messages ADD COLUMN compressed BOOLEAN NOT NULL DEFAULT FALSE;
