"""
Steam: signing in through Steam (OpenID) and importing games and hours (Web API).

Signing in needs no key: Steam's own page checks the password, then sends the
browser back to us with the player's Steam ID, and we ask Steam to confirm it.
Importing games needs STEAM_API_KEY in backend/.env.

Only the Python standard library is used (urllib), so there's nothing to install.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

STEAM_OPENID = "https://steamcommunity.com/openid/login"
CLAIMED_ID_RE = re.compile(r"^https?://steamcommunity\.com/openid/id/(\d{17})$")
TIMEOUT = 10        # seconds to wait for Steam before giving up
STORE_LOOKUPS = 15  # most store genre lookups per sync (the store limits how fast we can ask)

# ---------- Genres ----------
# Steam's official API doesn't say "FPS" or "Soulslike" (those are player tags),
# so popular games are labelled by hand here, by Steam app id.
# The labels match the model's genres (it lowercases them) and the Home filter chips.
KNOWN_GENRES = {
    # FPS
    730: "FPS",        # Counter-Strike 2
    440: "FPS",        # Team Fortress 2
    578080: "FPS",     # PUBG: Battlegrounds
    1172470: "FPS",    # Apex Legends
    359550: "FPS",     # Rainbow Six Siege
    2357570: "FPS",    # Overwatch 2
    1085660: "FPS",    # Destiny 2
    # Soulslike
    1245620: "Soulslike",  # Elden Ring
    374320: "Soulslike",   # Dark Souls III
    570940: "Soulslike",   # Dark Souls Remastered
    814380: "Soulslike",   # Sekiro: Shadows Die Twice
    # Cozy
    413150: "Cozy",    # Stardew Valley
    # MOBA
    570: "MOBA",       # Dota 2
    386360: "MOBA",    # SMITE
    # RPG
    1086940: "RPG",    # Baldur's Gate 3
    292030: "RPG",     # The Witcher 3
    489830: "RPG",     # Skyrim Special Edition
    1091500: "RPG",    # Cyberpunk 2077
    # Strategy
    289070: "Strategy",   # Civilization VI
    1158310: "Strategy",  # Crusader Kings III
    813780: "Strategy",   # Age of Empires II: DE
    394360: "Strategy",   # Hearts of Iron IV
    # Racing
    1551360: "Racing",  # Forza Horizon 5
    252950: "Racing",   # Rocket League
    244210: "Racing",   # Assetto Corsa
    # Survival
    252490: "Survival",  # Rust
    892970: "Survival",  # Valheim
    264710: "Survival",  # Subnautica
    322330: "Survival",  # Don't Starve Together
    251570: "Survival",  # 7 Days to Die
    346110: "Survival",  # ARK: Survival Evolved
    242760: "Survival",  # The Forest
    105600: "Survival",  # Terraria
}

# Steam store genres that mean the same as one of ours
STORE_TO_LABEL = {"RPG": "RPG", "Strategy": "Strategy", "Racing": "Racing", "Casual": "Cozy"}
# Store "genres" that say nothing about how a game plays
STORE_IGNORE = {"Indie", "Free to Play", "Early Access", "Massively Multiplayer"}


def label_from_store_genres(store_genres):
    """['Action', 'RPG'] -> 'RPG'. A genre the model doesn't know (like 'Action')
    is still shown on the profile; the model simply skips it."""
    for genre in store_genres:
        if genre in STORE_TO_LABEL:
            return STORE_TO_LABEL[genre]
    for genre in store_genres:
        if genre not in STORE_IGNORE:
            return genre
    return ""


# ---------- Talking to Steam ----------

def _get_json(url):
    with urllib.request.urlopen(url, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode())


def _api_key():
    key = os.getenv("STEAM_API_KEY")
    if not key:
        raise RuntimeError("STEAM_API_KEY is missing from backend/.env")
    return key


def login_url(return_to, realm):
    """Where the 'Sign in through Steam' button sends the browser."""
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID}?{urllib.parse.urlencode(params)}"


def verify_login(params, expected_return_to):
    """Steam sends the browser back with openid.* values. Anyone could fake those,
    so we check them ourselves and then ask Steam directly whether it really signed them.
    Returns the 17-digit Steam ID, or None."""
    if params.get("openid.mode") != "id_res":
        return None
    if params.get("openid.op_endpoint") != STEAM_OPENID:
        return None
    if params.get("openid.return_to") != expected_return_to:
        return None
    match = CLAIMED_ID_RE.match(params.get("openid.claimed_id", ""))
    if not match:
        return None

    check = {key: value for key, value in params.items() if key.startswith("openid.")}
    check["openid.mode"] = "check_authentication"
    request = urllib.request.Request(STEAM_OPENID, data=urllib.parse.urlencode(check).encode())
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            answer = response.read().decode()
    except (urllib.error.URLError, TimeoutError):
        return None
    return match.group(1) if "is_valid:true" in answer else None


def get_player_summary(steam_id):
    """Name, avatar and online status, or None."""
    url = ("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?"
           + urllib.parse.urlencode({"key": _api_key(), "steamids": steam_id}))
    players = _get_json(url).get("response", {}).get("players", [])
    return players[0] if players else None


def get_owned_games(steam_id):
    """[{appid, name, playtime_forever}, ...], or None if their game details are private."""
    url = ("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?"
           + urllib.parse.urlencode({"key": _api_key(), "steamid": steam_id,
                                     "include_appinfo": 1, "include_played_free_games": 1}))
    response = _get_json(url).get("response", {})
    return response.get("games") if "games" in response else None


def get_store_genres(app_id):
    """The store's genre names for one game, e.g. ['Action', 'RPG']. [] if unknown."""
    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=english"
    try:
        entry = _get_json(url).get(str(app_id), {})
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None   # couldn't ask: try again on a later sync
    if not entry.get("success"):
        return []
    return [g["description"] for g in entry.get("data", {}).get("genres", [])]


# ---------- Syncing a player ----------

def sync_player(conn, user_id, steam_id):
    """Fetches name, avatar, games and hours from Steam and saves them.
    Returns a summary for the page: {"private": bool, "games", "minutes", "top"}."""
    summary = get_player_summary(steam_id)
    games = get_owned_games(steam_id)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    conn.execute(
        "UPDATE users SET steam_name = ?, steam_avatar = ?, steam_synced_at = ? WHERE id = ?",
        (summary.get("personaname") if summary else None,
         summary.get("avatarfull") if summary else None, now, user_id),
    )
    if games is None:
        return {"private": True, "games": 0, "minutes": 0, "top": None}

    # Most played first, so genre lookups are spent on the games that matter
    games.sort(key=lambda g: g.get("playtime_forever", 0), reverse=True)

    cached = {row["app_id"]: row["genre"] for row in conn.execute("SELECT app_id, genre FROM steam_app_genres")}
    lookups = 0
    rows = []
    for game in games:
        app_id = game["appid"]
        minutes = game.get("playtime_forever", 0)
        genre = KNOWN_GENRES.get(app_id) or cached.get(app_id)
        if genre is None and minutes > 0 and lookups < STORE_LOOKUPS:
            lookups += 1
            store_genres = get_store_genres(app_id)
            if store_genres is not None:
                genre = label_from_store_genres(store_genres)
                conn.execute("INSERT OR REPLACE INTO steam_app_genres (app_id, genre) VALUES (?, ?)",
                             (app_id, genre))
        rows.append((user_id, app_id, game.get("name", f"App {app_id}"), genre or "", minutes))

    conn.execute("DELETE FROM user_games WHERE user_id = ?", (user_id,))
    conn.executemany(
        "INSERT INTO user_games (user_id, app_id, name, genre, minutes) VALUES (?, ?, ?, ?, ?)", rows)

    return {
        "private": False,
        "games": len(rows),
        "minutes": sum(row[4] for row in rows),
        "top": rows[0][2] if rows else None,
    }


def list_games(conn, user_id):
    """A player's games, most played first, in the same shape as mockData.js."""
    rows = conn.execute(
        "SELECT app_id, name, genre, minutes FROM user_games WHERE user_id = ? ORDER BY minutes DESC",
        (user_id,),
    ).fetchall()
    return [{"appId": r["app_id"], "name": r["name"], "genre": r["genre"], "minutes": r["minutes"]}
            for r in rows]


def steam_info(row):
    """The Steam part of /api/me, or None if no Steam account is linked."""
    if not row["steam_id"]:
        return None
    return {"id": row["steam_id"], "name": row["steam_name"],
            "avatar": row["steam_avatar"], "syncedAt": row["steam_synced_at"]}