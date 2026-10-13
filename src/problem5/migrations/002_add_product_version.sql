-- Row version for optimistic concurrency control (exposed as the HTTP ETag).
ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
