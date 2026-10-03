const me = MOCK_USERS.find((user) => user.id === CURRENT_USER_ID);

const params = new URLSearchParams(location.search);
// Demo mode only: add ?demo=private to the URL to see the "private library" screen
const demo = params.get("demo");

const STATES = ["start", "loading", "done", "private"];

let account = null; // the logged-in account, or null in demo mode (no backend)

// What the server means when it sends you back here with ?steam=...
const ERRORS = {
  invalid: "Steam sign-in didn't finish. Try again.",
  taken: "That Steam account is already linked to another Hangout account.",
  error: "Your Steam account is linked, but Steam didn't answer. Try Sync now in Settings.",
};

/* ---------- Switching screens ---------- */

function showState(name, moveFocus = true) {
  STATES.forEach((state) => {
    $(`state-${state}`).hidden = state !== name;
  });

  // Screen readers don't notice content swapping by itself,
  // so move focus to the new heading and they read it out.
  if (moveFocus) $(`state-${name}`).querySelector("h1").focus();

  if (name === "done") markSteamStepDone();
}

function markSteamStepDone() {
  const steam = $("step-steam");
  const meet = $("step-meet");

  steam.classList.replace("is-current", "is-done");
  steam.removeAttribute("aria-current");
  steam.querySelector(".setup-step__num").textContent = "✓";

  meet.classList.add("is-current");
  meet.setAttribute("aria-current", "step");
}

function showError(message) {
  const note = document.querySelector("#state-start .connect-note");
  note.textContent = message;
  note.classList.add("is-error");
}

/* ---------- Connected summary ---------- */

function fillSummary() {
  const games = [...me.games].sort((a, b) => b.minutes - a.minutes);
  const hours = Math.round(games.reduce((sum, game) => sum + game.minutes, 0) / 60);

  $("done-name").textContent = me.username;
  $("sum-games").textContent = games.length;
  $("sum-hours").textContent = hours.toLocaleString("en-US");
  $("sum-top").textContent = games.length > 0 ? games[0].name : "None yet";
}

/* ---------- Demo mode: fake Steam sign-in ---------- */

function fakeSteamSignIn() {
  showState("loading");

  setTimeout(() => {
    if (demo === "private") {
      showState("private");
    } else {
      fillSummary();
      showState("done");
    }
  }, 1500);
}

/* ---------- Buttons ---------- */

$("steam-signin").addEventListener("click", () => {
  if (!account) {
    fakeSteamSignIn();
    return;
  }
  // The real thing: the backend sends you to Steam's own sign-in page,
  // and Steam sends you back to /api/steam/callback, which brings you here again.
  showState("loading");
  location.href = "/api/steam/login";
});

// After making game details public on Steam, try again
$("check-again").addEventListener("click", async () => {
  showState("loading");

  if (!account) {
    setTimeout(() => {
      fillSummary();
      showState("done");
    }, 1200);
    return;
  }

  try {
    const result = await apiJSON("POST", "/api/steam/sync");
    if (result.private) {
      showState("private");
    } else {
      location.href = "connect-steam.html?steam=done"; // reload with your games
    }
  } catch {
    showState("private");
  }
});

/* ---------- Start ---------- */

loadAccount().then((result) => {
  account = result;
  const steam = params.get("steam");

  // Tidy the address bar so a reload doesn't show the same message again
  if (account && steam) history.replaceState(null, "", location.pathname);

  if (account && steam === "done") {
    fillSummary();
    showState("done", false);
  } else if (account && steam === "private") {
    showState("private", false);
  } else {
    showState("start", false);
    if (account && ERRORS[steam]) showError(ERRORS[steam]);
  }
});