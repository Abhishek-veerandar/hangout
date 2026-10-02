from pathlib import Path

import numpy as np
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.recommender import load_model, player_features
from app.db import init_db

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


# Must stay last: anything that isn't /api/... is served from frontend/.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")