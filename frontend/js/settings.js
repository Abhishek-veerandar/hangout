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

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = username.value.trim();
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

    me.username = name;
    me.bio = bio.value.trim();
    me.region = region.value;
        me.avatar = form.elements.avatar.value || null;
    try {
      if (me.avatar) localStorage.setItem("hangout-avatar", me.avatar);
    } catch {
      // not remembered, but still changed for this page
    }

    fillAvatar($("nav-avatar"), me);
    $("delete-username").textContent = me.username;
    setFormStatus(form, "Saved. (Resets on reload until the backend is connected.)");
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

  form.addEventListener("submit", (event) => {
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

    form.reset(); // never leave passwords sitting in the page
    setFormStatus(form, "Changing your password will work once the backend is connected.");
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
  $("steam-name").textContent = MOCK_ACCOUNT.steamName;
  $("steam-id").textContent = `Steam ID ${MOCK_ACCOUNT.steamId}`;

  $("steam-sync").addEventListener("click", () => {
    status.textContent = "Syncing will work once the backend is connected.";
  });

  $("steam-disconnect").addEventListener("click", () => {
    status.textContent = "Disconnecting removes your games from matching. This will work once the backend is connected.";
  });
}

/* ---------- Delete account ---------- */

function setupDelete() {
  const form = $("delete-form");
  const input = $("delete-confirm");
  const button = $("delete-btn");

  $("delete-username").textContent = me.username;

  // The button only unlocks when the username is typed exactly
  input.addEventListener("input", () => {
    button.disabled = input.value !== me.username;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value !== me.username) return;
    setFormStatus(form, "Account deletion will work once the backend is connected. Nothing was deleted.");
  });
}

/* ---------- Start ---------- */

/* ---------- Start ---------- */

loadAccount().then(() => {
  fillAvatar($("nav-avatar"), me);
  setupAccountMenu();
  setupProfileForm();
  setupEmailForm();
  setupPasswordForm();
  setupPrivacyForm();
  setupSteam();
  setupDelete();
});