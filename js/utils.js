// Small helpers shared by every page's JS.
// Load this file BEFORE the page's own script.

function $(id) {
  return document.getElementById(id);
}

function initials(username) {
  return username.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
}

// Picture if the user has one, otherwise their initials
function fillAvatar(element, user) {
  element.replaceChildren();
  if (user.avatarUrl) {
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
}
