"""
The database: one SQLite file (backend/hangout.db) with our tables.
SQLite is built into Python, so there's nothing to install.
"""
import sqlite3
from pathlib import Path

# backend/app/db.py -> backend/hangout.db
DB_PATH = Path(__file__).resolve().parent.parent / "hangout.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    region        TEXT    NOT NULL DEFAULT '',
    bio           TEXT    NOT NULL DEFAULT '',
    avatar        TEXT,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS email_tokens (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email      TEXT    NOT NULL,
    expires_at TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_requests (
    from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT    NOT NULL DEFAULT 'pending',   -- 'pending' or 'accepted'
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (from_id, to_id),                   -- one request per pair
    CHECK (from_id != to_id)                         -- you can't befriend yourself
);
"""


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row            # rows behave like dicts: row["username"]
    conn.execute("PRAGMA foreign_keys = ON")  # SQLite needs this to enforce REFERENCES
    return conn


def init_db():
    """Creates the tables if they don't exist yet. Safe to run every time the server starts."""
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)

        # Add columns that were introduced after the first version of the table
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        if "email_verified" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")

        conn.commit()
    finally:
        conn.close()