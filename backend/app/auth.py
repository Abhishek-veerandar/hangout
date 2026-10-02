"""
Passwords and sign-up rules.

We never store a password. We store a "hash": the result of running the password
through scrypt, a deliberately slow one-way function. At login we hash what the
user typed the same way and compare. Even if the database leaks, the passwords don't.
"""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
# scrypt settings: higher N = slower = harder to brute-force (16384 is a common choice)
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_password(password):
    salt = secrets.token_bytes(16)   # random per user, so two equal passwords get different hashes
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    # Store the settings and salt next to the hash, so we can check it later
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        _, n, r, p, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                                n=int(n), r=int(r), p=int(p), dklen=32)
    except (ValueError, TypeError):
        return False
    # compare_digest takes the same time whether the first or last byte differs,
    # so attackers can't learn anything from how long the check takes
    return hmac.compare_digest(digest.hex(), digest_hex)


def signup_error(username, email, password):
    """The same rules as auth.js. The server checks again because anyone can skip the browser."""
    if not USERNAME_RE.match(username):
        return "Username must be 3 to 20 letters, numbers or underscores."
    if not EMAIL_RE.match(email):
        return "That doesn't look like an email address."
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    return None

# ---------- Login sessions ----------

SESSION_DAYS = 30


def _token_hash(token):
    # We store a hash of the session token, not the token itself, so even a
    # leaked database can't be used to log in as someone.
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(conn, user_id):
    """Makes a new random login token for user_id and returns it (for the cookie)."""
    token = secrets.token_urlsafe(32)          # 256 random bits: impossible to guess
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (_token_hash(token), user_id, expires.isoformat()),
    )
    return token


def user_for_session(conn, token):
    """The logged-in user for this token, or None if it's missing, unknown or expired."""
    if not token:
        return None
    row = conn.execute(
        """SELECT users.id, users.username, users.email, users.region, users.bio,
                  users.avatar, sessions.expires_at
           FROM sessions JOIN users ON users.id = sessions.user_id
           WHERE sessions.token = ?""",
        (_token_hash(token),),
    ).fetchone()
    if row is None:
        return None
    if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        delete_session(conn, token)
        return None
    return row


def delete_session(conn, token):
    conn.execute("DELETE FROM sessions WHERE token = ?", (_token_hash(token),))