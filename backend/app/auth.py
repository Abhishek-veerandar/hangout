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

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,16}$")
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
        return "Username must be 3 to 16 letters, numbers or underscores."
    if not EMAIL_RE.match(email):
        return "That doesn't look like an email address."
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    return None
# ---------- Profile rules ----------
# Must match the options in settings.html and AVATARS in utils.js
REGIONS = {"", "India", "Singapore", "UAE", "Japan", "United Kingdom", "United States", "Other"}
AVATARS = {"smith", "archer", "assassin", "knight", "mage", "monk"}
BIO_MAX = 80   # same as maxlength on the bio input


def profile_error(username, bio, region, avatar):
    """Checked again on the server because anyone can skip the browser."""
    if not USERNAME_RE.match(username):
        return "Username must be 3 to 16 letters, numbers or underscores."
    if len(bio) > BIO_MAX:
        return f"Bio must be at most {BIO_MAX} characters."
    if region not in REGIONS:
        return "Pick a region from the list."
    if avatar is not None and avatar not in AVATARS:
        return "That character doesn't exist."
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
                  users.avatar, users.email_verified, users.created_at,
                  users.steam_id, users.steam_name, users.steam_avatar, users.steam_synced_at,
                  sessions.expires_at
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

def password_error(password):
    """The same length rules as signup."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    return None


def delete_other_sessions(conn, user_id, keep_token):
    """Logs out every other device, but keeps this browser logged in."""
    conn.execute(
        "DELETE FROM sessions WHERE user_id = ? AND token != ?",
        (user_id, _token_hash(keep_token or "")),
    )

# ---------- Email verification ----------

VERIFY_HOURS = 24


def create_email_token(conn, user_id, email):
    """A one-time token for the link we email. Stored hashed, like session tokens."""
    conn.execute("DELETE FROM email_tokens WHERE user_id = ?", (user_id,))  # old links stop working
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_HOURS)
    conn.execute(
        "INSERT INTO email_tokens (token, user_id, email, expires_at) VALUES (?, ?, ?, ?)",
        (_token_hash(token), user_id, email, expires.isoformat()),
    )
    return token


def use_email_token(conn, token):
    """Marks the email verified. Returns True if the token was valid."""
    row = conn.execute(
        "SELECT user_id, email, expires_at FROM email_tokens WHERE token = ?",
        (_token_hash(token),),
    ).fetchone()
    if row is None:
        return False
    conn.execute("DELETE FROM email_tokens WHERE token = ?", (_token_hash(token),))  # one use only
    if datetime.fromisoformat(row["expires_at"]) < datetime.now(timezone.utc):
        return False
    # Only verify if it's still the same address (it may have changed since)
    conn.execute(
        "UPDATE users SET email_verified = 1 WHERE id = ? AND email = ?",
        (row["user_id"], row["email"]),
    )
    return True


def send_verification_email(email, link):
    """For now the 'email' is printed in the uvicorn terminal.
    Later: send it for real here (SMTP or an email service), and nothing else changes."""
    print(f"\n=== Verify email for {email} ===\n{link}\n", flush=True)