import sqlite3
from pathlib import Path

import numpy as np
from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.auth import (SESSION_DAYS, create_email_token, create_session, delete_other_sessions,
                      delete_session, hash_password, password_error, profile_error,
                      send_verification_email, signup_error, use_email_token,
                      user_for_session, verify_password)
from app.db import get_connection, init_db
from app.recommender import load_model, player_features

# backend/app/main.py → up three levels is the repo root → frontend/
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

app = FastAPI(title="Hangout API")
init_db()   # create the database tables on startup (does nothing if they exist)
# Load the model ONCE when the server starts, not on every request
recommender = load_model()


# ---------- What the requests look like (FastAPI checks these for us) ----------

class Game(BaseModel):
    name: str
    genre: str = ""
    minutes: int = 0


class Player(BaseModel):
    id: str
    region: str = ""
    games: list[Game] = []


class RecommendRequest(BaseModel):
    me: Player
    candidates: list[Player]
    limit: int = 5


# ---------- Routes ----------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/recommendations")
def recommendations(request: RecommendRequest):
    """Scores every candidate against `me` and returns the best matches first."""
    if not request.candidates:
        return {"results": []}

    meta = recommender.meta

    def features(player):
        return player_features([g.model_dump() for g in player.games], player.region, meta)

    me_vec = features(request.me)
    candidate_vecs = np.stack([features(c) for c in request.candidates])
    me_vecs = np.repeat(me_vec[None], len(candidate_vecs), axis=0)   # me, once per candidate

    probabilities = recommender.probability(me_vecs, candidate_vecs)

    ranked = sorted(zip(request.candidates, probabilities), key=lambda pair: pair[1], reverse=True)
    return {
        "results": [
            {"id": c.id, "score": round(float(p), 3), "reason": explain_match(request.me, c)}
            for c, p in ranked[: request.limit]
        ]
    }


def explain_match(me, other):
    """A short human reason for the match. The model scores; this just explains."""
    my_games = {g.name.lower(): g for g in me.games}
    shared = [(my_games[g.name.lower()], g) for g in other.games if g.name.lower() in my_games]
    if shared:
        mine, theirs = max(shared, key=lambda pair: pair[0].minutes + pair[1].minutes)
        return f"You both play {mine.name}: {mine.minutes // 60}h vs {theirs.minutes // 60}h."

    my_genres = {g.genre.lower() for g in me.games if g.genre}
    common = [g.genre for g in other.games if g.genre.lower() in my_genres]
    if common:
        return f"You both spend a lot of time on {common[0]} games."

    if me.region and me.region == other.region:
        return f"Also plays from {other.region}."
    return "Similar play style."


# ---------- Accounts ----------

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str


@app.post("/api/signup", status_code=201)
def signup(body: SignupRequest, request: Request):
    username = body.username.strip()
    email = body.email.strip().lower()

    error = signup_error(username, email, body.password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    conn = get_connection()
    try:
        # The ? placeholders let SQLite insert the values safely.
        # NEVER build SQL with f-strings from user input (that's how SQL injection happens).
        cursor = conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, hash_password(body.password)),
        )
        user_id = cursor.lastrowid
        token = create_email_token(conn, user_id, email)
        conn.commit()
    except sqlite3.IntegrityError as e:
        # UNIQUE rule broken: the name or email is already used
        detail = "That username is taken." if "username" in str(e) else "An account with that email already exists."
        raise HTTPException(status_code=409, detail=detail)
    finally:
        conn.close()

    send_verification_email(email, f"{request.base_url}api/verify-email?token={token}")
    return {"id": user_id, "username": username}


SESSION_COOKIE = "hangout_session"

# Hashing a fake password when the username doesn't exist makes a failed login
# take the same time either way, so nobody can learn which usernames exist by timing it.
DUMMY_HASH = hash_password("not-a-real-password")


class LoginRequest(BaseModel):
    username: str      # username OR email
    password: str


@app.post("/api/login")
def login(body: LoginRequest, response: Response):
    name = body.username.strip()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? OR email = ?",
            (name, name.lower()),
        ).fetchone()

        if row is None:
            verify_password(body.password, DUMMY_HASH)
            raise HTTPException(status_code=401, detail="Wrong username or password.")
        if not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Wrong username or password.")

        token = create_session(conn, row["id"])
        conn.commit()
    finally:
        conn.close()

    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,     # JavaScript can't read it, so injected scripts can't steal it
        samesite="lax",    # other websites can't make your browser send it with their forms
        secure=False,      # True once the site runs on https
    )
    return {"id": row["id"], "username": row["username"]}


def current_user(hangout_session: str | None = Cookie(default=None)):
    """Any route that needs a logged-in user adds:  user = Depends(current_user)"""
    conn = get_connection()
    try:
        user = user_for_session(conn, hangout_session)
        conn.commit()      # saves the cleanup if an expired session was removed
    finally:
        conn.close()
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in.")
    return user


@app.get("/api/me")
def me(user=Depends(current_user)):
    return {
        "id": user["id"], "username": user["username"], "email": user["email"],
        "region": user["region"], "bio": user["bio"], "avatar": user["avatar"],
        "emailVerified": bool(user["email_verified"]),
        "joinedAt": user["created_at"][:10]
    }
class ProfileUpdate(BaseModel):
    username: str
    bio: str = ""
    region: str = ""
    avatar: str | None = None


@app.patch("/api/me")
def update_me(body: ProfileUpdate, user=Depends(current_user)):
    username = body.username.strip()
    bio = body.bio.strip()

    error = profile_error(username, bio, body.region, body.avatar)
    if error:
        raise HTTPException(status_code=400, detail=error)

    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET username = ?, bio = ?, region = ?, avatar = ? WHERE id = ?",
            (username, bio, body.region, body.avatar, user["id"]),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        # The UNIQUE rule on username: someone else already has it
        raise HTTPException(status_code=409, detail="That username is taken.")
    finally:
        conn.close()

    return {
        "id": user["id"], "username": username, "email": user["email"],
        "region": body.region, "bio": bio, "avatar": body.avatar,
    }

@app.post("/api/logout")
def logout(response: Response, hangout_session: str | None = Cookie(default=None)):
    if hangout_session:
        conn = get_connection()
        try:
            delete_session(conn, hangout_session)
            conn.commit()
        finally:
            conn.close()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}

class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/me/password")
def change_password(body: PasswordChange, user=Depends(current_user),
                    hangout_session: str | None = Cookie(default=None)):
    error = password_error(body.new_password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    conn = get_connection()
    try:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        # 400, not 401: a 401 would make the page think you're logged out
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Your current password is wrong.")
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.new_password), user["id"]),
        )
        delete_other_sessions(conn, user["id"], hangout_session)
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


class DeleteAccount(BaseModel):
    password: str


@app.post("/api/me/delete")
def delete_account(body: DeleteAccount, response: Response, user=Depends(current_user)):
    conn = get_connection()
    try:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=400, detail="Wrong password.")
        # ON DELETE CASCADE removes their sessions and email tokens too
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
        conn.commit()
    finally:
        conn.close()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}

@app.get("/api/verify-email")
def verify_email(token: str = ""):
    """The link in the email lands here, then sends you back to the site."""
    conn = get_connection()
    try:
        ok = use_email_token(conn, token) if token else False
        conn.commit()
    finally:
        conn.close()
    return RedirectResponse(f"/home.html?verified={'1' if ok else 'expired'}")


@app.post("/api/verify-email/resend")
def resend_verification(request: Request, user=Depends(current_user)):
    if user["email_verified"]:
        return {"ok": True, "alreadyVerified": True}
    conn = get_connection()
    try:
        token = create_email_token(conn, user["id"], user["email"])
        conn.commit()
    finally:
        conn.close()
    send_verification_email(user["email"], f"{request.base_url}api/verify-email?token={token}")
    return {"ok": True}

# Must stay last: anything that isn't /api/... is served from frontend/.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")