import sqlite3
from pathlib import Path

import numpy as np
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.auth import (SESSION_DAYS, create_session, delete_session, hash_password,
                      signup_error, user_for_session, verify_password)
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
def signup(body: SignupRequest):
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
        conn.commit()
    except sqlite3.IntegrityError as e:
        # UNIQUE rule broken: the name or email is already used
        detail = "That username is taken." if "username" in str(e) else "An account with that email already exists."
        raise HTTPException(status_code=409, detail=detail)
    finally:
        conn.close()

    return {"id": cursor.lastrowid, "username": username}


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

# Must stay last: anything that isn't /api/... is served from frontend/.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")