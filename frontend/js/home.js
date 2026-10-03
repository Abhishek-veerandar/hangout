/* ---------- Helpers ---------- */

function byId(id) {
  return MOCK_USERS.find((user) => user.id === id);
}

function byName(name) {
  const wanted = name.toLowerCase();
  return MOCK_USERS.find((user) => user.username.toLowerCase() === wanted);
}



function showStatus(message) {
  $("home-status").textContent = message;
}

/* ---------- Page state ---------- */
// Everything the page changes while you click around.
// Later, every change here also becomes a fetch() call to the backend.

const me = byId(CURRENT_USER_ID);
let account = null; // the logged-in account, or null in demo mode

const state = {
  incoming: [...MOCK_FRIEND_REQUESTS], // ids of people who asked to be my friend
  outgoing: new Set(),                 // ids I've sent requests to
  dismissed: new Set(),                // recommendations I marked "not interested"
  filter: "all",
  recs: [],
  recsLoading: true,
};

/* ---------- Intro ---------- */

function renderIntro() {
  $("welcome").textContent = `Welcome back, ${me.username}`;
  const count = getRecommendations("all").length;
  $("match-count").textContent = `> ${count} new ${count === 1 ? "match" : "matches"} today`;
}


/* ---------- Friend requests ---------- */

function renderRequests() {
  const section = $("requests");
  const list = $("requests-list");
  const template = $("request-template");
  const people = state.incoming.map(byId).filter(Boolean);

  section.hidden = people.length === 0;
  if (people.length === 0) return;

  const names = people.map((person) => person.username);
  $("requests-summary").textContent =
    people.length === 1
      ? `▶ 1 new friend request from ${names[0]}`
      : `▶ ${people.length} new friend requests: ${names.join(", ")}`;

  list.replaceChildren();
  people.forEach((person) => {
    const item = template.content.cloneNode(true);
    item.querySelector(".request__who").href = profileLink(person);
    fillAvatar(item.querySelector(".request__avatar"), person);
    item.querySelector(".request__name").textContent = person.username;

    const accept = item.querySelector('[data-action="accept"]');
    const decline = item.querySelector('[data-action="decline"]');
    accept.setAttribute("aria-label", `Accept ${person.username}`);
    decline.setAttribute("aria-label", `Decline ${person.username}`);
    accept.addEventListener("click", () => answerRequest(person, true));
    decline.addEventListener("click", () => answerRequest(person, false));

    list.append(item);
  });
}

/* ---------- Achievements ---------- */
// Later, the backend decides these and remembers which ones you already got.

const FRIEND_ACHIEVEMENTS = [
  { count: 1, title: "Player 2 has joined", text: "Your first friend on Hangout." },
  { count: 5, title: "Squad goals: 5 friends", text: "That's a full party." },
  { count: 10, title: "Raid ready: 10 friends", text: "Time to plan something big." },
];

function checkFriendAchievements() {
  const unlocked = FRIEND_ACHIEVEMENTS.find((a) => a.count === me.friendIds.length);
  if (unlocked) showToast(unlocked);
}

async function answerRequest(person, accepted) {
  // Real players: tell the server first. Mock players stay local, as before.
  if (account && person.dbId) {
    try {
      await apiJSON("POST", `/api/friends/requests/${person.dbId}/${accepted ? "accept" : "decline"}`);
    } catch (error) {
      showStatus(error.message);
      return;
    }
  }

  state.incoming = state.incoming.filter((id) => id !== person.id);

  if (accepted) {
    me.friendIds.push(person.id);
    person.friendIds.push(me.id);
    showStatus(`You and ${person.username} are now friends.`);
    checkFriendAchievements();
  } else {
    showStatus(`Declined ${person.username}'s request.`);
  }

  renderRequests();
  renderOnline();
  renderRecommendations();

  // The clicked button is gone now, so move keyboard focus somewhere sensible
  const nextButton = $("requests-list").querySelector("button");
  if (nextButton && !$("requests").hidden) nextButton.focus();
}

function setupRequestsToggle() {
  const toggle = $("requests-toggle");
  const list = $("requests-list");

  toggle.addEventListener("click", () => {
    const opening = list.hidden;
    list.hidden = !opening;
    toggle.setAttribute("aria-expanded", opening);
    toggle.textContent = opening ? "Hide" : "Review";
  });
}

/* ---------- Friends online ---------- */

// Order and wording for each Steam status. "offline" and "hidden" are left out on purpose.
const STATUS_INFO = {
  "in-game": { order: 0, label: (steam) => `In-game · ${steam.game}` },
  "looking-to-play": { order: 1, label: () => "Looking to play" },
  online: { order: 2, label: () => "Online" },
  busy: { order: 3, label: () => "Busy" },
  away: { order: 4, label: () => "Away" },
};

function renderOnline() {
  const list = $("online-list");
  const template = $("online-row-template");

  // ONLY friends. Strangers' status is never shown.
  const friends = me.friendIds.map(byId).filter(Boolean);
  const online = friends
    .filter((friend) => friend.steam && STATUS_INFO[friend.steam.state])
    .sort((a, b) => STATUS_INFO[a.steam.state].order - STATUS_INFO[b.steam.state].order);

  $("online-count").textContent = `${online.length} of ${friends.length} · from Steam`;

  list.replaceChildren();
  online.forEach((friend) => {
    const item = template.content.cloneNode(true);
    item.querySelector(".online-row").dataset.state = friend.steam.state;
    item.querySelector(".online-row__link").href = profileLink(friend);
    fillAvatar(item.querySelector(".online-row__avatar"), friend);
    item.querySelector(".online-row__name").textContent = friend.username;
    item.querySelector(".online-row__status").textContent =
      STATUS_INFO[friend.steam.state].label(friend.steam);

    const ping = item.querySelector(".online-row__ping");
    ping.setAttribute("aria-label", `Ping ${friend.username}`);
    ping.addEventListener("click", () => {
      showStatus(`Pinging ${friend.username} comes with chat in a later phase.`);
    });

    list.append(item);
  });
  $("online-empty").hidden = online.length > 0;
}

/* ---------- Add friend by username ---------- */

function setupAddFriend() {
  const form = $("add-friend-form");
  const input = $("add-username");
  const message = $("add-username-msg");

  function say(text, isError) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
    input.setAttribute("aria-invalid", isError ? "true" : "false");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = input.value.trim().replace(/^@/, ""); // allow "@rook_07" too

    if (!name) {
      say("Type a username first.", true);
      return;
    }

    // Logged in for real: look the name up in the database
    if (account) {
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; // stops double-clicks sending two requests
      try {
        const result = await apiJSON("POST", "/api/friends/requests", { username: name });
        const person = realUser(result.user);

        if (result.status === "accepted") {
          // They had already asked you, so asking back means yes
          me.friendIds.push(person.id);
          person.friendIds.push(me.id);
          state.incoming = state.incoming.filter((id) => id !== person.id);
          say(`You and ${person.username} are now friends.`, false);
          renderRequests();
          renderOnline();
          checkFriendAchievements();
        } else {
          state.outgoing.add(person.id);
          say(`Request sent to ${person.username}.`, false);
        }
        input.value = "";
      } catch (error) {
        // "No player called ...", "That's you!", "Request already sent ..."
        say(error.message, true);
      } finally {
        submit.disabled = false;
      }
      return;
    }

    // Demo mode (no backend): search the mock players, as before
    const person = byName(name);

    if (!person) {
      say(`No player called "${name}".`, true);
    } else if (person.id === me.id) {
      say("That's you!", true);
    } else if (me.friendIds.includes(person.id)) {
      say(`You're already friends with ${person.username}.`, true);
    } else if (state.incoming.includes(person.id)) {
      say(`${person.username} already sent you a request. Accept it above.`, true);
    } else if (state.outgoing.has(person.id)) {
      say(`Request already sent to ${person.username}.`, true);
    } else {
      state.outgoing.add(person.id);
      say(`Request sent to ${person.username}.`, false);
      input.value = "";
      renderRecommendations(); // their "Add" button turns into "Sent"
    }
  });
}

/* ---------- Screenshot upload + Steam sync ---------- */

const MAX_UPLOAD_MB = 10;

function setupUpload() {
  $("shot-input").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const sizeMb = file.size / 1024 / 1024;

    if (!file.type.startsWith("image/")) {
      showStatus("That file isn't an image.");
    } else if (sizeMb > MAX_UPLOAD_MB) {
      showStatus(`That image is ${sizeMb.toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`);
    } else {
      showStatus(`Got "${file.name}" (${sizeMb.toFixed(1)} MB). Uploading will work once the backend is connected.`);
    }

    event.target.value = ""; // lets you pick the same file again
  });
}

function setupSync() {
  const button = $("sync-btn");
  const text = $("steam-sync-text");

  if (account) {
    if (!account.steam) {
      text.textContent = "Steam · not connected";
      button.textContent = "Connect";
    } else if (account.steam.syncedAt) {
      const when = new Date(account.steam.syncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      text.textContent = `Steam · synced ${when}`;
    }
  }

  button.addEventListener("click", async () => {
    if (!account) {
      showStatus("Demo mode: no backend, so nothing was synced.");
      return;
    }
    if (!account.steam) {
      location.href = "connect-steam.html";
      return;
    }
    button.disabled = true;
    showStatus("Syncing with Steam…");
    try {
      const result = await apiJSON("POST", "/api/steam/sync");
      if (result.private) {
        showStatus("Your game details are private on Steam, so no games were imported.");
      } else {
        location.reload(); // redraw everything with your new games
      }
    } catch (error) {
      showStatus(error.message);
    } finally {
      button.disabled = false;
    }
  });
}
/* ---------- Asking the model for matches ---------- */
// Sends me + everyone I could be matched with to the backend.
// The PyTorch-trained model scores every pair and sends back the best first.

function toPlayer(user) {
  return {
    id: user.id,
    region: user.region,
    games: user.games.map((game) => ({
      name: game.name,
      genre: game.genre || "",
      minutes: game.minutes || 0,
    })),
  };
}

async function loadRecommendations() {
  const candidates = MOCK_USERS.filter((user) =>
    user.id !== me.id &&
    !me.friendIds.includes(user.id) &&
    !state.incoming.includes(user.id)
  );

  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        me: toPlayer(me),
        candidates: candidates.map(toPlayer),
        limit: candidates.length,   // ranked list of everyone; filters and ✕ narrow it down here
      }),
    });
    if (!response.ok) throw new Error(`Server answered ${response.status}`);

    const data = await response.json();
    state.recs = data.results.map((r) => ({ userId: r.id, score: r.score, reason: r.reason }));
  } catch (error) {
    // No backend running (e.g. python -m http.server)? Fall back to the mock list.
    console.warn("Recommender not reachable, using mock data:", error);
    state.recs = MOCK_RECOMMENDATIONS;
  }

  state.recsLoading = false;
  renderIntro();
  renderRecommendations();
}

/* ---------- Recommendations ---------- */

function matchesFilter(user, filter) {
  if (filter === "all") return true;
  if (filter === "region") return user.region === me.region;
  return user.games.some((game) => game.genre === filter);
}

function getRecommendations(filter) {
  return state.recs
    .filter((rec) => !state.dismissed.has(rec.userId))
    .map((rec) => ({ ...rec, user: byId(rec.userId) }))
    .filter((rec) =>
      rec.user &&
      rec.user.id !== me.id &&
      !me.friendIds.includes(rec.user.id) &&
      !state.incoming.includes(rec.user.id)
    )
    .filter((rec) => matchesFilter(rec.user, filter))
    .sort((a, b) => b.score - a.score);
}

function renderRecommendations() {
  const list = $("recs-list");
  const template = $("rec-template");
  const empty = $("recs-empty");

  const all = getRecommendations("all");
  const topId = all.length > 0 ? all[0].userId : null; // top match = best score overall
  const recs = getRecommendations(state.filter);

  list.replaceChildren();
  recs.forEach((rec) => {
    const item = template.content.cloneNode(true);
    const isTop = rec.userId === topId;

    item.querySelector(".rec").classList.toggle("rec--top", isTop);
    item.querySelector(".rec__badge").hidden = !isTop;
    fillAvatar(item.querySelector(".rec__avatar"), rec.user);

    const name = item.querySelector(".rec__name");
    name.textContent = rec.user.username;
    name.href = profileLink(rec.user);

    item.querySelector(".rec__region").textContent = rec.user.region;
    item.querySelector(".rec__reason").textContent = rec.reason;

    const dismiss = item.querySelector(".rec__dismiss");
    dismiss.setAttribute("aria-label", `Not interested in ${rec.user.username}`);
    dismiss.addEventListener("click", () => {
      // Later: this is feedback the recommendation model can learn from
      state.dismissed.add(rec.userId);
      showStatus(`Hidden ${rec.user.username}. This helps improve your matches.`);
      renderRecommendations();
      renderIntro();
    });

    const add = item.querySelector(".rec__add");
    if (state.outgoing.has(rec.userId)) {
      add.textContent = "Sent";
      add.disabled = true;
    }
    add.addEventListener("click", () => {
      state.outgoing.add(rec.userId);
      showStatus(`Request sent to ${rec.user.username}.`);
      renderRecommendations();
    });

    list.append(item);
  });

  empty.hidden = recs.length > 0;
  if (state.recsLoading) {
    empty.textContent = "Finding players like you…";
  } else if (all.length === 0) {
    empty.textContent = "No new matches right now. Check back after your next Steam sync.";
  } else {
    empty.textContent = "No matches for this filter.";
  }
}

function setupFilters() {
  const chips = [...document.querySelectorAll(".chip")];

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filter = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute("aria-pressed", c === chip));
      renderRecommendations();
    });
  });
}

/* ---------- Start ---------- */

/* ---------- Start ---------- */
// Wait to find out who's logged in, then draw the page with their name


loadAccount().then(async (result) => {
  account = result;
  if (account) {
    const lists = await loadFriends();
    if (lists) {
      state.incoming = lists.incoming;          // real requests replace the mock ones
      state.outgoing = new Set(lists.outgoing);
    }
  }

  fillAvatar($("nav-avatar"), me);
  renderIntro();
  renderRequests();
  renderOnline();
  renderRecommendations();
  loadRecommendations(); // async fetch() to backend recommender

  setupAccountMenu();
  setupRequestsToggle();
  setupAddFriend();
  setupUpload();
  setupSync();
  setupFilters();
});