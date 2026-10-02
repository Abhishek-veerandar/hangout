const me = MOCK_USERS.find((user) => user.id === CURRENT_USER_ID);

// Add ?demo=private to the URL to see the "private library" screen
const demo = new URLSearchParams(location.search).get("demo");

const STATES = ["start", "loading", "done", "private"];

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

/* ---------- Connected summary ---------- */

function fillSummary() {
  const games = [...me.games].sort((a, b) => b.minutes - a.minutes);
  const hours = Math.round(games.reduce((sum, game) => sum + game.minutes, 0) / 60);

  $("done-name").textContent = me.username;
  $("sum-games").textContent = games.length;
  $("sum-hours").textContent = hours.toLocaleString("en-US");
  $("sum-top").textContent = games.length > 0 ? games[0].name : "None yet";
}

/* ---------- Fake Steam sign-in ---------- */
// The real version: this button is a plain link to our backend
// (something like /auth/steam/login). The backend sends you to Steam's
// sign-in page, and Steam sends you back with your Steam ID,
// which the backend double-checks with Steam before trusting it.

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

$("steam-signin").addEventListener("click", fakeSteamSignIn);

// Pretend the user fixed their privacy settings and try again
$("check-again").addEventListener("click", () => {
  showState("loading");
  setTimeout(() => {
    fillSummary();
    showState("done");
  }, 1200);
});

/* ---------- Start ---------- */

loadAccount().then(() => showState("start", false));