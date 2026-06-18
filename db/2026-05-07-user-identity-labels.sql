ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);

CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_labels_name ON labels(name);

CREATE TABLE IF NOT EXISTS address_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address_id INTEGER NOT NULL,
    label_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_address_labels_address_id ON address_labels(address_id);
CREATE INDEX IF NOT EXISTS idx_address_labels_label_id ON address_labels(label_id);

INSERT OR IGNORE INTO labels(name)
SELECT DISTINCT trim(display_label)
FROM address
WHERE display_label IS NOT NULL AND trim(display_label) != '';

INSERT OR IGNORE INTO address_labels(address_id, label_id)
SELECT a.id, l.id
FROM address a
JOIN labels l ON l.name = trim(a.display_label)
WHERE a.display_label IS NOT NULL AND trim(a.display_label) != '';

INSERT OR REPLACE INTO settings (key, value)
VALUES ('db_version', 'v0.0.10');
