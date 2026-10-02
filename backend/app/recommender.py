"""
Runs the friend recommender trained in notebooks/hangout_recommender.ipynb.

Training happens in Colab with PyTorch. Here we only need to RUN the trained
model, which is just two Linear layers, a ReLU and a normalize, so plain NumPy
is enough (and avoids PyTorch's DLLs, which Windows blocks on this laptop).
"""
import json
import hashlib
from pathlib import Path

import numpy as np

# backend/app/recommender.py -> backend/models/
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


class Recommender:
    def __init__(self, weights, meta):
        # The learned numbers, same names as in the Colab export cell
        self.w1, self.b1 = weights["w1"], weights["b1"]   # first Linear: 54 -> 64
        self.w2, self.b2 = weights["w2"], weights["b2"]   # second Linear: 64 -> 32
        self.scale = float(weights["scale"])
        self.bias = float(weights["bias"])
        self.meta = meta                                  # genres, regions, games, ...

    def embed(self, x):
        """x: (n_players, 54) features -> (n_players, 32) fingerprints of length 1."""
        h = np.maximum(0, x @ self.w1.T + self.b1)        # Linear + ReLU (Dropout is off when predicting)
        e = h @ self.w2.T + self.b2                       # Linear
        norm = np.linalg.norm(e, axis=1, keepdims=True)
        return e / np.maximum(norm, 1e-12)                # same as F.normalize

    def score(self, xa, xb):
        """Logit for each pair (row i of xa with row i of xb). Higher = better match."""
        sim = (self.embed(xa) * self.embed(xb)).sum(axis=1)   # cosine similarity
        return self.scale * sim + self.bias

    def probability(self, xa, xb):
        """The same score squashed into 0..1 with a sigmoid."""
        return 1 / (1 + np.exp(-self.score(xa, xb)))


def load_model(models_dir=MODELS_DIR):
    weights = np.load(models_dir / "recommender_weights.npz")
    meta = json.loads((models_dir / "recommender_meta.json").read_text())
    return Recommender(weights, meta)

# ---------- Turning a real player into the 54 numbers the model expects ----------


def game_slot(name, genre, games):
    """
    The model was trained on placeholder games: 5 per genre (fps_0 ... fps_4).
    A real game like "Elden Ring" goes into one of its genre's 5 slots, chosen
    from its name, so the same game always lands in the same slot.
    (md5 instead of Python's hash(), which changes every time Python restarts.)
    """
    slots = [i for i, (_, g) in enumerate(games) if g == genre]
    if not slots:
        return None                      # a genre the model has never seen
    digest = hashlib.md5(name.lower().encode()).digest()
    return slots[digest[0] % len(slots)]


def player_features(games_played, region, meta):
    """
    games_played: list of {"name": ..., "genre": ..., "minutes": ...}
                  (the same shape as the games in mockData.js / Steam)
    Returns a NumPy array of 54 numbers, built EXACTLY like in the notebook:
      40 game hours (log-squashed) + 8 genre shares + 6 region one-hot
    """
    genres, regions, games = meta["genres"], meta["regions"], meta["games"]

    hours = np.zeros(len(games))
    for game in games_played:
        genre = str(game.get("genre", "")).lower()
        slot = game_slot(str(game.get("name", "")), genre, games)
        if slot is not None:
            hours[slot] += game.get("minutes", 0) / 60

    game_feat = np.log1p(hours) / meta["hours_scale"]

    genre_hours = np.zeros(len(genres))
    for slot, (_, genre) in enumerate(games):
        genre_hours[genres.index(genre)] += hours[slot]
    genre_share = genre_hours / max(genre_hours.sum(), 1e-9)

    region_onehot = np.zeros(len(regions))
    if region in regions:
        region_onehot[regions.index(region)] = 1

    return np.concatenate([game_feat, genre_share, region_onehot]).astype(np.float32)