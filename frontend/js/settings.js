/* ---------- Mock data this page needs ---------- */
// Private account details aren't in MOCK_USERS on purpose:
// other players should never receive someone's email.
const MOCK_ACCOUNT = {
  email: "pixel_ronin@example.com",
  steamName: "pixel_ronin",
  steamId: "76561198000000001",
};

const me = MOCK_USERS.find((user) => user.id === CURRENT_USER_ID);

const privacy = {
  showStatus: true,
  showGames: true,
  requestsFrom: "everyone",
};
let account = null; // filled in by loadAccount()
const USERNAME_RULE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Small helpers ---------- */

// Each input's error line has the id "<input id>-error"
function setError(input, message) {
  const errorEl = $(`${input.id}-error`);
  if (errorEl) errorEl.textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
  return message === "";
}

function setFormStatus(form, message) {
  form.querySelector(".panel__status").textContent = message;
}

/* ---------- Profile ---------- */

function setupProfileForm() {
  const form = $("profile-form");
  const username = $("set-username");
  const bio = $("set-bio");
  const region = $("set-region");
  const count = $("set-bio-count");

  username.value = me.username;
  bio.value = me.bio;
  region.value = me.region;

  function updateCount() {
    count.textContent = `${bio.value.length} / ${bio.maxLength}`;
  }
  bio.addEventListener("input", updateCount);
  updateCount();
    // ----- Character select -----
  const grid = $("char-grid");
  const template = $("char-option-template");

  AVATARS.forEach((id) => {
    const option = template.content.cloneNode(true);
    const input = option.querySelector("input");
    input.value = id;
    input.checked = me.avatar === id;
    setSprite(option.querySelector(".char-option__sprite"), avatarSrc(id));
    option.querySelector(".char-option__name").textContent = avatarName(id);
    grid.append(option);
  });

  // Preview the pick in the header straight away, before saving
  grid.addEventListener("change", (event) => {
    fillAvatar($("nav-avatar"), { ...me, avatar: event.target.value });
  });

    form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormStatus(form, "");

    const name = username.value.trim();
    // Mock players are still on screen, so don't let you take one of their names
    const taken = MOCK_USERS.some(
      (user) => user.id !== me.id && user.username.toLowerCase() === name.toLowerCase()
    );

    let message = "";
    if (!USERNAME_RULE.test(name)) message = "3–16 characters: letters, numbers or _";
    else if (taken) message = "That username is taken.";

    if (!setError(username, message)) {
      username.focus();
      return;
    }

    const changes = {
      username: name,
      bio: bio.value.trim(),
      region: region.value,
      avatar: form.elements.avatar.value || null,
    };

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (account) {
        await apiJSON("PATCH", "/api/me", changes);   // saved in the database
      } else {
        // Demo mode: no backend, so remember the character in this browser only
        try {
          if (changes.avatar) localStorage.setItem("hangout-avatar", changes.avatar);
        } catch {
          // storage blocked: still changed for this page
        }
      }
    } catch (error) {
      if (error.status === 409) {
        setError(username, error.message);   // "That username is taken."
        username.focus();
      } else {
        setFormStatus(form, error.message);
      }
      return;
    } finally {
      submit.disabled = false;
    }

    Object.assign(me, changes);
    fillAvatar($("nav-avatar"), me);
    $("delete-username").textContent = me.username;
    setFormStatus(form, account ? "Saved." : "Saved in this browser only (demo mode).");
  });
}

/* ---------- Account ---------- */

function setupEmailForm() {
  const form = $("email-form");
  const email = $("set-email");
  email.value = MOCK_ACCOUNT.email;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = email.value.trim();

    if (!setError(email, EMAIL_RULE.test(value) ? "" : "That email doesn't look right")) {
      email.focus();
      return;
    }

    if (value.toLowerCase() === MOCK_ACCOUNT.email.toLowerCase()) {
      setFormStatus(form, "That's already your email.");
    } else {
      setFormStatus(form, `We'd send a confirmation link to ${value}. Your email changes once you click it.`);
    }
  });
}

function setupPasswordForm() {
  const form = $("password-form");
  const current = $("set-current");
  const next = $("set-new");
  const confirm = $("set-confirm");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormStatus(form, "");

    let nextMessage = "";
    if (next.value.length < 8) nextMessage = "Use at least 8 characters";
    else if (next.value === current.value) nextMessage = "Pick something different from your current password";

    // Check all three so every problem shows at once
    const results = [
      setError(current, current.value ? "" : "Enter your current password"),
      setError(next, nextMessage),
      setError(confirm, confirm.value && confirm.value === next.value ? "" : "Passwords don't match"),
    ];

    const firstInvalid = [current, next, confirm][results.indexOf(false)];
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    if (!account) {
      form.reset();
      setFormStatus(form, "Demo mode: no backend, so nothing was changed.");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await apiJSON("POST", "/api/me/password", {
        current_password: current.value,
        new_password: next.value,
      });
      form.reset(); // never leave passwords sitting in the page
      setFormStatus(form, "Password changed. Your other devices were logged out.");
    } catch (error) {
      if (error.message.includes("current password")) {
        setError(current, error.message);
        current.focus();
      } else {
        setFormStatus(form, error.message);
      }
    } finally {
      submit.disabled = false;
    }
  });
}

/* ---------- Privacy ---------- */

function setupPrivacyForm() {
  const form = $("privacy-form");

  form.elements.showStatus.checked = privacy.showStatus;
  form.elements.showGames.checked = privacy.showGames;
  form.elements.requestsFrom.value = privacy.requestsFrom; // picks the matching radio

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    privacy.showStatus = form.elements.showStatus.checked;
    privacy.showGames = form.elements.showGames.checked;
    privacy.requestsFrom = form.elements.requestsFrom.value;
    setFormStatus(form, "Privacy settings saved. (Resets on reload until the backend is connected.)");
  });
}

/* ---------- Steam ---------- */
function setupSteam() {
  const status = $("steam-status");
  const sync = $("steam-sync");
  const disconnect = $("steam-disconnect");
  const connect = $("steam-connect");

  if (!account) {
    // Demo mode: the mock Steam account
    $("steam-name").textContent = MOCK_ACCOUNT.steamName;
    $("steam-id").textContent = `Steam ID ${MOCK_ACCOUNT.steamId}`;
    $("steam-synced").textContent = "Last synced 2h ago";
    sync.addEventListener("click", () => { status.textContent = "Demo mode: no backend, so nothing was synced."; });
    disconnect.addEventListener("click", () => { status.textContent = "Demo mode: no backend, so nothing changed."; });
    return;
  }

  function show(steam) {
    const linked = Boolean(steam);
    $("steam-name").textContent = linked ? steam.name || "Steam account" : "Not connected";
    $("steam-id").textContent = linked ? `Steam ID ${steam.id}` : "Connect Steam to match on your real games.";
    $("steam-synced").textContent = linked && steam.syncedAt
      ? `Last synced ${new Date(steam.syncedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
      : "";
    sync.hidden = !linked;
    disconnect.hidden = !linked;
    connect.hidden = linked;
  }
  show(account.steam);

  sync.addEventListener("click", async () => {
    sync.disabled = true;
    status.textContent = "Syncing with Steam…";
    try {
      const result = await apiJSON("POST", "/api/steam/sync");
      account.steam.syncedAt = new Date().toISOString();
      show(account.steam);
      status.textContent = result.private
        ? "Your game details are private on Steam, so no games were imported."
        : `Synced ${result.games} games (${Math.round(result.minutes / 60).toLocaleString("en-US")} hours).`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      sync.disabled = false;
    }
  });

  disconnect.addEventListener("click", async () => {
    disconnect.disabled = true;
    try {
      await apiJSON("POST", "/api/steam/disconnect");
      account.steam = null;
      me.games = [];
      show(null);
      status.textContent = "Steam disconnected. Your games were removed from matching.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      disconnect.disabled = false;
    }
  });
}

/* ---------- Delete account ---------- */

function setupDelete() {
  const form = $("delete-form");
  const input = $("delete-confirm");
  const password = $("delete-password");
  const button = $("delete-btn");

  $("delete-username").textContent = me.username;

  // Unlocks only when the username is typed exactly AND a password is entered
  function update() {
    button.disabled = input.value !== me.username || password.value === "";
  }
  input.addEventListener("input", update);
  password.addEventListener("input", update);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;

    if (!account) {
      setFormStatus(form, "Demo mode: no backend, so nothing was deleted.");
      return;
    }

    button.disabled = true;
    try {
      await apiJSON("POST", "/api/me/delete", { password: password.value });
      try {
        localStorage.removeItem("hangout-avatar");
        localStorage.removeItem("hangout-arcade-best");
      } catch {
        // storage blocked: nothing to clean up
      }
      location.href = "index.html";
    } catch (error) {
      setError(password, error.message);   // "Wrong password."
      password.value = "";
      password.focus();
      update();
    }
  });
}

/* ---------- Start ---------- */

/* ---------- Start ---------- */

loadAccount().then((result) => {
  account = result;
  if (account) MOCK_ACCOUNT.email = account.email;
  fillAvatar($("nav-avatar"), me);
  setupAccountMenu();
  setupProfileForm();
  setupEmailForm();
  setupPasswordForm();
  setupPrivacyForm();
  setupSteam();
  setupDelete();
});