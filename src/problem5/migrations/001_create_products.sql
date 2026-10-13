CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sku         TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT,
  category    TEXT    NOT NULL,
  -- Money is stored as integer cents: SQLite has no exact DECIMAL type.
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status      TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TEXT    NOT NULL, -- ISO 8601 UTC, set by the application
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_products_category   ON products (category);
CREATE INDEX idx_products_status     ON products (status);
CREATE INDEX idx_products_price      ON products (price_cents);
CREATE INDEX idx_products_created_at ON products (created_at);
