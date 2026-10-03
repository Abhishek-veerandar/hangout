const HOURS_PER_LEVEL = 80;
const TOP_GAMES_SHOWN = 5;

const numberFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

/* ---------- Small helpers ---------- */

function toHours(minutes) {
  return Math.round(minutes / 60);
}

function findUserByName(username) {
  return MOCK_USERS.find((user) => user.username === username);
}

function findUserById(id) {
  return MOCK_USERS.find((user) => user.id === id);
}

function showStatus(message) {
  $("profile-status").textContent = message;
}

/* ---------- Rendering ---------- */
// IMPORTANT: we only ever use textContent for user data, never innerHTML.
// Bios and usernames are typed by users. With innerHTML, a bio like
// <img src=x onerror="stealCookies()"> would run as code (an XSS attack).

function renderProfile(user, isOwn) {
  document.title = `${user.username} · Hangout`;

  const games = [...user.games].sort((a, b) => b.minutes - a.minutes);
  const totalHours = toHours(games.reduce((sum, game) => sum + game.minutes, 0));
  const level = Math.floor(totalHours / HOURS_PER_LEVEL) + 1;

  fillAvatar($("profile-avatar"), user);
  $("profile-name").textContent = user.username;
  const metaParts = user.region ? [user.region] : [];
  if (user.avatar) metaParts.push(avatarName(user.avatar));
  metaParts.push(`Joined ${dateFormat.format(new Date(user.joinedAt))}`);
  $("profile-meta").textContent = metaParts.join(" · ");
  $("profile-bio").textContent = user.bio;
  $("profile-bio").hidden = !user.bio;

  $("stat-level").textContent = level;
  $("stat-games").textContent = numberFormat.format(games.length);
  $("stat-hours").textContent = numberFormat.format(totalHours);
  $("stat-friends").textContent = user.friendIds.length;
  $("stat-arcade").textContent = user.arcadeBest ? numberFormat.format(user.arcadeBest) : "—";

  $(isOwn ? "own-actions" : "visitor-actions").hidden = false;

  renderGames(games, isOwn);
  renderScreenshots(user, isOwn);
  renderFriends(user, isOwn);
  setupActions(user);
}

function renderGames(games, isOwn) {
  const grid = $("game-grid");
  const template = $("game-card-template");
  const showAll = $("show-all");
  const empty = $("games-empty");
  const maxMinutes = games.length > 0 ? games[0].minutes : 1;

  if (games.length === 0) {
    empty.textContent = isOwn
      ? "Connect your Steam library to show your games here."
      : "This player hasn't connected Steam yet.";
    empty.hidden = false;
    return;
  }

  function draw(list) {
    grid.replaceChildren();

    list.forEach((game, i) => {
      const card = template.content.cloneNode(true);
      card.querySelector(".game-card__rank").textContent = `Rank ${i + 1}`;
      card.querySelector(".game-card__genre").textContent = game.genre;
      card.querySelector(".game-card__name").textContent = game.name;
      card.querySelector(".game-card__hours").textContent = `${numberFormat.format(toHours(game.minutes))}h`;
      card.querySelector(".bar__fill").dataset.percent = (game.minutes / maxMinutes) * 100;
      grid.append(card);
    });

    // Bars start at width 0 (from the CSS). Forcing a layout first means
    // the browser notices the change, so the width animates instead of jumping.
    void grid.offsetWidth;
    grid.querySelectorAll(".bar__fill").forEach((fill) => {
      fill.style.width = fill.dataset.percent + "%";
    });
  }

  draw(games.slice(0, TOP_GAMES_SHOWN));

  if (games.length > TOP_GAMES_SHOWN) {
    showAll.textContent = `Show all ${games.length} games`;
    showAll.hidden = false;
    showAll.addEventListener("click", () => {
      draw(games);
      showAll.hidden = true;
    }, { once: true });
  }
}

function renderScreenshots(user, isOwn) {
  const grid = $("shot-grid");
  const empty = $("shots-empty");

  grid.replaceChildren();
  user.screenshots.forEach((shot) => {
    const item = document.createElement("li");
    const img = document.createElement("img");
    img.src = shot.url;
    img.alt = shot.caption || `Screenshot by ${user.username}`;
    item.append(img);
    grid.append(item);
  });

  empty.hidden = user.screenshots.length > 0;
  empty.textContent = isOwn
    ? "You haven't added any screenshots yet. Uploading comes in a later update."
    : `${user.username} hasn't added any screenshots yet.`;
}

function renderFriends(user, isOwn) {
  const list = $("friend-grid");
  const template = $("friend-card-template");
  const empty = $("friends-empty");
  const friends = user.friendIds.map(findUserById).filter(Boolean);

  list.replaceChildren();
  friends.forEach((friend) => {
    const item = template.content.cloneNode(true);
    item.querySelector(".friend-card").href = `profile.html?user=${encodeURIComponent(friend.username)}`;
    fillAvatar(item.querySelector(".friend-card__avatar"), friend);
    item.querySelector(".friend-card__name").textContent = friend.username;
    item.querySelector(".friend-card__meta").textContent = friend.region;
    list.append(item);
  });

  empty.hidden = friends.length > 0;
  empty.textContent = isOwn
    ? "No friends yet. Go find people who play what you play."
    : `${user.username} hasn't added any friends yet.`;
}

/* ---------- Buttons ---------- */

function setupActions(user) {
  $("edit-btn").addEventListener("click", () => {
    location.href = "settings.html";
  });

  $("share-btn").addEventListener("click", async () => {
    // new URL(...) builds a full link from the current page's address
    const link = new URL(`profile.html?user=${encodeURIComponent(user.username)}`, location.href).href;
    try {
      await navigator.clipboard.writeText(link);
      showStatus("Profile link copied.");
    } catch {
      // Clipboard access is blocked on file:// pages, so show the link instead
      showStatus(`Copy this link: ${link}`);
    }
  });

  const addBtn = $("add-friend-btn");
  const LABELS = { none: "Add friend", outgoing: "Request sent", incoming: "Accept request", friends: "Friends ✓" };

  function showFriendButton() {
    addBtn.textContent = LABELS[user.friendStatus] || "Add friend";
    addBtn.disabled = user.friendStatus === "outgoing" || user.friendStatus === "friends";
  }

  if (user.dbId) {
    // A real player
    showFriendButton();
    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      try {
        if (user.friendStatus === "incoming") {
          await apiJSON("POST", `/api/friends/requests/${user.dbId}/accept`);
          user.friendStatus = "friends";
        } else {
          const result = await apiJSON("POST", "/api/friends/requests", { username: user.username });
          user.friendStatus = result.status === "accepted" ? "friends" : "outgoing";
        }
        showStatus(user.friendStatus === "friends"
          ? `You and ${user.username} are now friends.`
          : `Request sent to ${user.username}.`);
      } catch (error) {
        showStatus(error.message);
      }
      showFriendButton();
    });
  } else {
    // A mock player: the old demo behaviour
    addBtn.addEventListener("click", () => {
      addBtn.textContent = "Request sent";
      addBtn.disabled = true;
      showStatus("Mock players can't receive real requests.");
    });
  }

  $("message-btn").addEventListener("click", () => {
    showStatus("Chat is coming in a later phase.");
  });
}

/* ---------- Tabs ---------- */

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];

  function select(tab) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", selected);
      t.tabIndex = selected ? 0 : -1; // only the active tab is in the Tab order
      $(t.getAttribute("aria-controls")).hidden = !selected;
    });
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));

    // Left/right arrows move between tabs, the same wrap-around trick as the carousel
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
}

/* ---------- Not found ---------- */

function showNotFound(name) {
  document.title = "Player not found · Hangout";
  $("profile-view").hidden = true;
  $("not-found").hidden = false;
  $("not-found-name").textContent = name;
}

/* ---------- Start ---------- */
// profile.html              → your own profile
// profile.html?user=rook_07 → someone else's profile
//
// async because we wait for loadAccount() first. It asks the server who is
// logged in and copies your real username/region/bio/avatar onto the mock
// current user. Logged out → it sends you to auth.html.
/* ---------- Real profiles from the server ---------- */

async function loadProfile(username) {
  let response;
  try {
    response = await fetch(`/api/users/${encodeURIComponent(username)}`);
  } catch {
    return null;
  }
  if (!response.ok) return null;   // not a real player: maybe a mock one

  const data = await response.json();
  const user = realUser(data);
  user.friendIds = data.friends.map((card) => realUser(card).id);
  user.friendStatus = data.friendStatus;
  user.games = data.games || [];   // self | friends | outgoing | incoming | none
  return user;
} 

/* ---------- Start ---------- */
// profile.html              → your own profile
// profile.html?user=rook_07 → someone else's profile

loadAccount().then(async (account) => {
  const currentUser = findUserById(CURRENT_USER_ID);
  const requestedName = new URLSearchParams(location.search).get("user");

  // Logged in: ask the server first (your own profile, or a real player's)
  let user = account ? await loadProfile(requestedName || account.username) : null;
  // Not a real player (or demo mode): fall back to the mock players
  if (!user) user = requestedName ? findUserByName(requestedName) : currentUser;

  fillAvatar($("nav-avatar"), currentUser);
  setupAccountMenu();
  if (user) {
    renderProfile(user, user.id === CURRENT_USER_ID);
    setupTabs();
  } else {
    showNotFound(requestedName);
  }

  // A new best in the game popup updates your own profile straight away
  document.addEventListener("arcade:best", (event) => {
    currentUser.arcadeBest = event.detail.score;
    if (user && user.id === CURRENT_USER_ID) {
      $("stat-arcade").textContent = numberFormat.format(event.detail.score);
    }
  });
});