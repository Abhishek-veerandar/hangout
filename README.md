# Hangout

**Find people who play what you play.** Hangout connects to your Steam library and matches you with players who share your games, your hours and your region. Matching is done by a neural recommender trained for this project.

> Status: in active development. Accounts, friends, Steam sign-in and game import work end to end. Some players shown on the site are still demo data (see [Roadmap](#roadmap)).

<!-- Add a screenshot or GIF here, e.g. docs/home.png -->

## Features

- **Accounts:** sign up, sign in with username or email, email verification, change password (logs out your other devices), delete account.
- **Steam:** sign in through Steam (OpenID), import your owned games and playtime, sync or disconnect any time.
- **Friends:** send, accept and decline friend requests; public profiles with friends lists.
- **Recommendations:** a trained model ranks players by how well your libraries and regions match, with a short human-readable reason for each match.
- **Profiles and settings:** pixel-art characters, bio, region, level from total hours, top games with hour bars.
- **Extras:** day and night themes, optional 8-bit sound effects, achievement toasts, and **Hangout Quest**, a small canvas platformer built into the site.

## Tech stack

| Part | Built with |
|---|---|
| Frontend | Plain HTML, CSS and JavaScript (no framework, no build step) |
| Backend | Python, FastAPI, SQLite |
| Model training | PyTorch (Google Colab notebook) |
| Model serving | NumPy only, no PyTorch needed on the server |
| Integrations | Steam OpenID 2.0, Steam Web API |

## How the matching works

The recommender is a **two-tower network**: one shared tower turns each player into a 32-number "fingerprint", and two players match well when their fingerprints point the same way (cosine similarity).

**Player features (54 numbers):**

- 40 game-hour features (5 game slots per genre, hours squashed with `log(1 + hours)`)
- 8 genre shares (fraction of total playtime per genre)
- 6 region one-hot values

**Model:** `Linear(54 → 64) → ReLU → Dropout → Linear(64 → 32) → normalize`, then `score = scale × cosine + bias`, trained with binary cross-entropy on 300,000 player pairs.

**Training data:** synthetic players with a hidden taste per genre, so the model has to learn taste from what people actually play. Friendship labels come from taste similarity plus a same-region bonus, with noise.

**Results on held-out pairs (AUC, higher is better):**

| Method | AUC |
|---|---|
| Count shared games | 0.571 |
| Genre similarity | 0.674 |
| Genre similarity + region | 0.706 |
| **Hangout model** | **0.738** |
| Ceiling (knows the hidden taste) | 0.837 |

The model beats the best hand-written rule by about 3 points, closing roughly a quarter of the gap to the theoretical ceiling. Training is in [`notebooks/hangout_recommender.ipynb`](notebooks/hangout_recommender.ipynb). The server runs the exported weights with NumPy in [`backend/app/recommender.py`](backend/app/recommender.py).

## Security

- Passwords hashed with **scrypt** and a random salt per user; never stored or logged.
- Session tokens are 256-bit random values, stored **hashed**, sent in **httpOnly, SameSite=Lax** cookies.
- Failed logins take the same time whether or not the user exists (no username probing).
- Email verification links are single-use, stored hashed, and expire after 24 hours.
- Steam sign-in is verified **server-side** with Steam, and a state cookie prevents another site from linking its Steam account to yours.
- All SQL uses parameterised queries; user content is rendered with `textContent`, never `innerHTML`.
- Secrets (API keys) live in `backend/.env`, which is git-ignored.

## Getting started

**Requirements:** Python 3.10 or newer.

```bash
git clone https://github.com/Abhishek-veerandar/hangout.git
cd hangout/backend

python -m venv .venv
# Windows:      .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate

pip install -r requirements.txt
```

**Optional: Steam.** To use Steam sign-in and game import, get a key at <https://steamcommunity.com/dev/apikey> and create `backend/.env`:

```
STEAM_API_KEY=your_key_here
```

**Run it:**

```bash
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. The database (`backend/hangout.db`) is created on first start.

Email is not sent yet: verification links are printed in the terminal running uvicorn. Open the printed link to verify an account.

## Project structure

```
backend/
  app/
    main.py          API routes; also serves the frontend
    auth.py          passwords, sessions, email verification
    db.py            SQLite schema and migrations
    friends.py       friend requests and friendships
    steam.py         Steam sign-in, game import, genre mapping
    recommender.py   NumPy inference for the trained model
  models/            exported model weights and metadata
frontend/
  *.html             landing, auth, home, profile, settings, connect Steam, 404
  css/               design tokens, components, page styles, themes
  js/                page scripts, shared helpers, Hangout Quest game
notebooks/
  hangout_recommender.ipynb   model training (PyTorch)
```

## API overview

| Method | Route | What it does |
|---|---|---|
| POST | `/api/signup`, `/api/login`, `/api/logout` | Accounts and sessions |
| GET, PATCH | `/api/me` | Your account; update username, bio, region, character |
| POST | `/api/me/password`, `/api/me/delete` | Change password, delete account |
| GET, POST | `/api/verify-email`, `/api/verify-email/resend` | Email verification |
| GET | `/api/friends` | Friends and pending requests |
| POST | `/api/friends/requests`, `.../{id}/accept`, `.../{id}/decline` | Friend requests |
| GET | `/api/users/{username}` | Public profile |
| GET | `/api/steam/login`, `/api/steam/callback` | Steam sign-in |
| POST | `/api/steam/sync`, `/api/steam/disconnect` | Re-import or unlink Steam |
| POST | `/api/recommendations` | Rank candidate players for a user |

Interactive docs are at <http://127.0.0.1:8000/docs> while the server runs.

## Roadmap

- [ ] Better genre detection (Steam's API only exposes broad genres; use community tags)
- [ ] Real online status for friends from Steam
- [ ] Recommendations over real players instead of demo players, then remove mock data
- [ ] Real email delivery and password reset
- [ ] Screenshot uploads and saved privacy settings
- [ ] Deploy with HTTPS
- [ ] Chat and "ping a friend"
