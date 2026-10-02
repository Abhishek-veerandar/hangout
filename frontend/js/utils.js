// Small helpers shared by every page's JS.
// Load this file BEFORE the page's own script.

function $(id) {
  return document.getElementById(id);
}

function initials(username) {
  return username.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}

/* ---------- Pixel avatars ---------- */

// The 6 characters in img/avatars/. The file name is the id.
const AVATARS = ["smith", "archer", "assassin", "knight", "mage", "monk"];

function avatarSrc(id) {
  return `img/avatars/${id}.png`;
}

// "mage" → "Mage"
function avatarName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const spriteFrames = {}; // image path → frame count, so each sheet is measured only once

// Turns any element into an animated sprite
function setSprite(element, src) {
  element.classList.add("has-sprite");
  element.style.backgroundImage = `url("${src}")`;
  element.style.backgroundRepeat = "no-repeat";
  // The sheet is (frames × box width) wide, so the box shows one frame at a time
  element.style.backgroundSize = "calc(var(--frames, 4) * 100%) 100%";

  if (spriteFrames[src]) {
    element.style.setProperty("--frames", spriteFrames[src]);
    return;
  }

  // Frames are square, so: number of frames = sheet width ÷ sheet height
  const img = new Image();
  img.onload = () => {
    spriteFrames[src] = Math.max(1, Math.round(img.naturalWidth / img.naturalHeight));
    element.style.setProperty("--frames", spriteFrames[src]);
  };
  img.src = src;
}

function clearSprite(element) {
  element.classList.remove("has-sprite");
  ["background-image", "background-repeat", "background-size", "--frames"].forEach((property) => {
    element.style.removeProperty(property);
  });
}

// Character if the user picked one, else their photo, else their initials
function fillAvatar(element, user) {
  element.replaceChildren();
  clearSprite(element);

  if (user.avatar) {
    setSprite(element, avatarSrc(user.avatar));
  } else if (user.avatarUrl) {
    const img = document.createElement("img");
    img.src = user.avatarUrl;
    img.alt = "";
    element.append(img);
  } else {
    element.textContent = initials(user.username);
  }
}

function profileLink(user) {
  return `profile.html?user=${encodeURIComponent(user.username)}`;
}

/* ---------- Account menu ---------- */

function setupAccountMenu() {
  const button = $("account-button");
  const menu = $("account-menu");

  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open);
  }

  button.addEventListener("click", () => setOpen(menu.hidden));

  // Close when clicking anywhere else
  document.addEventListener("click", (event) => {
    if (!button.contains(event.target) && !menu.contains(event.target)) setOpen(false);
  });

  // Close with Escape and put focus back on the button
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  setupLogout();
 
}

/* ---------- Who's logged in ---------- */
// Asks the server who owns this browser's login cookie.
// - Logged in: copies your real name (and region, bio, character) onto the mock
//   "current user", so every page shows YOU. Games and friends stay mock for now.
// - Not logged in: sends you to the log-in page.
// - No backend running (python -m http.server): demo mode with the mock user.
async function loadAccount() {
  let response;
  try {
    response = await fetch("/api/me");
  } catch {
    return null;                       // no server at all: demo mode
  }

  if (response.status === 401) {
    location.href = "auth.html";       // not logged in
    return new Promise(() => {});      // never finishes: the page is leaving anyway
  }
  if (!response.ok) return null;       // e.g. 404 from python's server: demo mode

  const account = await response.json();
  const me = MOCK_USERS.find((user) => user.id === CURRENT_USER_ID);
  if (me) {
    me.username = account.username;
    if (account.region) me.region = account.region;
    if (account.bio) me.bio = account.bio;
    if (account.avatar) me.avatar = account.avatar;
  }
  return account;
}

// Any link or button with data-action="logout" logs you out
function setupLogout() {
  document.querySelectorAll('[data-action="logout"]').forEach((el) => {
    el.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await fetch("/api/logout", { method: "POST" });
      } catch {
        // server unreachable: still leave the page
      }
      location.href = "index.html";
    });
  });
}
