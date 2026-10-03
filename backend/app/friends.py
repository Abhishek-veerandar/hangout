"""
Friends: requests and friendships, all in one table.

friend_requests has one row per pair of players:
  status 'pending'  -> from_id asked to_id, no answer yet
  status 'accepted' -> they're friends (direction no longer matters)
Declining a request just deletes its row.
"""

# The public part of a user. NEVER add email or password_hash here:
# these cards are sent to other players.
USER_COLUMNS = "users.id, users.username, users.region, users.bio, users.avatar, users.created_at"


def user_card(row):
    return {
        "id": row["id"], "username": row["username"], "region": row["region"],
        "bio": row["bio"], "avatar": row["avatar"], "joinedAt": row["created_at"][:10],
    }


def find_user(conn, username):
    # COLLATE NOCASE on the column makes this case-insensitive
    return conn.execute(
        f"SELECT {USER_COLUMNS} FROM users WHERE username = ?", (username,)
    ).fetchone()


def friendship_status(conn, me_id, other_id):
    """'self', 'friends', 'outgoing' (I asked), 'incoming' (they asked) or 'none'."""
    if me_id == other_id:
        return "self"
    row = conn.execute(
        """SELECT from_id, status FROM friend_requests
           WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)""",
        (me_id, other_id, other_id, me_id),
    ).fetchone()
    if row is None:
        return "none"
    if row["status"] == "accepted":
        return "friends"
    return "outgoing" if row["from_id"] == me_id else "incoming"


def list_friends(conn, user_id):
    # USER_COLUMNS is our own constant, so this f-string is safe;
    # the user id still goes in through a ? placeholder.
    return conn.execute(
        f"""SELECT {USER_COLUMNS} FROM friend_requests f
            JOIN users ON users.id = CASE WHEN f.from_id = ? THEN f.to_id ELSE f.from_id END
            WHERE f.status = 'accepted' AND ? IN (f.from_id, f.to_id)
            ORDER BY users.username COLLATE NOCASE""",
        (user_id, user_id),
    ).fetchall()


def list_requests(conn, user_id):
    """(incoming, outgoing): pending requests sent to me, and sent by me."""
    incoming = conn.execute(
        f"""SELECT {USER_COLUMNS} FROM friend_requests f JOIN users ON users.id = f.from_id
            WHERE f.to_id = ? AND f.status = 'pending' ORDER BY f.created_at""",
        (user_id,),
    ).fetchall()
    outgoing = conn.execute(
        f"""SELECT {USER_COLUMNS} FROM friend_requests f JOIN users ON users.id = f.to_id
            WHERE f.from_id = ? AND f.status = 'pending' ORDER BY f.created_at""",
        (user_id,),
    ).fetchall()
    return incoming, outgoing


def send_request(conn, me_id, other_id):
    conn.execute("INSERT INTO friend_requests (from_id, to_id) VALUES (?, ?)", (me_id, other_id))


def accept_request(conn, me_id, from_id):
    """True if there was a pending request from from_id to me."""
    cursor = conn.execute(
        """UPDATE friend_requests SET status = 'accepted'
           WHERE from_id = ? AND to_id = ? AND status = 'pending'""",
        (from_id, me_id),
    )
    return cursor.rowcount == 1


def decline_request(conn, me_id, from_id):
    cursor = conn.execute(
        "DELETE FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'",
        (from_id, me_id),
    )
    return cursor.rowcount == 1