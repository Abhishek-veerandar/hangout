const auth = document.querySelector("#auth");
const signInWrap = document.querySelector("#signin-wrap");
const signUpWrap = document.querySelector("#signup-wrap");
const panelLeft = document.querySelector("#panel-left");
const panelRight = document.querySelector("#panel-right");

/* ---------- Switching between sign in and sign up ---------- */

// The URL hash decides the mode: auth.html#signup or auth.html#signin
function modeFromHash() {
  return location.hash === "#signup" ? "signup" : "signin";
}

function setMode(mode, moveFocus) {
  const isSignup = mode === "signup";
  auth.classList.toggle("is-signup", isSignup);

  // inert = can't be clicked, tabbed into, or read by screen readers.
  // Without it, keyboard users could Tab into the invisible form.
  signUpWrap.inert = !isSignup;
  signInWrap.inert = isSignup;
  panelLeft.inert = !isSignup;
  panelRight.inert = isSignup;

  document.title = (isSignup ? "Sign up" : "Log in") + " · Hangout";

  if (moveFocus) {
    const wrap = isSignup ? signUpWrap : signInWrap;
    wrap.querySelector("input").focus({ preventScroll: true });
  }
}

// Every button with data-show="signup" / "signin" just changes the hash.
// The hashchange listener does the rest, so the browser's Back button works too.
document.querySelectorAll("[data-show]").forEach((button) => {
  button.addEventListener("click", () => {
    location.hash = button.dataset.show;
  });
});

window.addEventListener("hashchange", () => setMode(modeFromHash(), true));

setMode(modeFromHash(), false);

// Turn animations back on after the first paint
requestAnimationFrame(() => {
  requestAnimationFrame(() => auth.classList.remove("is-loading"));
});

/* ---------- Validation ---------- */

// Each input has data-rule="…" that picks one of these.
// A rule returns "" when the value is fine, or an error message.
const rules = {
  username(value) {
    if (value === "") return "Choose a username";
    return /^[A-Za-z0-9_]{3,16}$/.test(value)
      ? ""
      : "3–16 characters: letters, numbers or _";
  },
  email(value) {
    if (value === "") return "Enter your email";
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "" : "That email doesn't look right";
  },
  newPassword(value) {
    return value.length >= 8 ? "" : "Use at least 8 characters";
  },
  confirmPassword(value, form) {
    if (value === "") return "Re-enter your password";
    return value === form.elements.password.value ? "" : "Passwords don't match";
  },
  password(value) {
    return value === "" ? "Enter your password" : "";
  },
};

function validateField(input) {
  const rule = rules[input.dataset.rule];
  if (!rule) return true;

  // Never trim passwords: spaces can be part of them
  const value = input.type === "password" ? input.value : input.value.trim();
  const message = rule(value, input.form);

  const errorEl = document.getElementById(input.getAttribute("aria-describedby"));
  errorEl.textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");

  return message === "";
}

function setupForm(form, successMessage , redirectTo) {
  const inputs = [...form.querySelectorAll("[data-rule]")];
  const status = form.querySelector(".form-status");

  form.addEventListener("submit", (event) => {
    event.preventDefault(); // stop the page reload
    status.textContent = "";

    // Check every field (not just until the first error) so all messages show
    const results = inputs.map(validateField);
    const firstInvalid = inputs.find((input, i) => !results[i]);

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    // Later: send the data to the backend with fetch() here
    status.textContent = successMessage;
    if (redirectTo) {
      setTimeout(() => { location.href = redirectTo; }, 800);
    }
});
  // Once a field shows an error, re-check it while typing so it clears as soon as it's fixed
  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") validateField(input);
    });
  });

  // Buttons that aren't wired up yet (Steam, Discord, forgot password)
  form.querySelectorAll("[data-message]").forEach((button) => {
    button.addEventListener("click", () => {
      status.textContent = button.dataset.message;
    });
  });
}

setupForm(
  document.querySelector("#signup-form"),
  "Account created! Next: connect Steam…",
  "connect-steam.html"
);
setupForm(
  document.querySelector("#signin-form"),
  "Signed in! Taking you home…",
  "home.html"
);