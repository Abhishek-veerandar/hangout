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
    login(value) {
    return value === "" ? "Enter your username or email" : "";
  },
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

// Sends JSON to the backend. Throws the server's error message if it says no.
async function postJSON(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Our own errors have a text "detail"; FastAPI's validation errors have a list
    throw new Error(typeof body.detail === "string" ? body.detail : "Something went wrong. Try again.");
  }
  return body;
}

function setupForm(form, send, successMessage, redirectTo) {
  const inputs = [...form.querySelectorAll("[data-rule]")];
  const status = form.querySelector(".form-status");
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";

    const results = inputs.map(validateField);
    const firstInvalid = inputs.find((input, i) => !results[i]);
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    submit.disabled = true; // stops double-clicks creating two requests
    try {
      await send(form);
      status.textContent = successMessage;
      setTimeout(() => { location.href = redirectTo; }, 800);
    } catch (error) {
      status.textContent = error.message; // e.g. "That username is taken."
      submit.disabled = false;
    }
  });

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (input.getAttribute("aria-invalid") === "true") validateField(input);
    });
  });

  form.querySelectorAll("[data-message]").forEach((button) => {
    button.addEventListener("click", () => {
      status.textContent = button.dataset.message;
    });
  });
}

setupForm(
  document.querySelector("#signup-form"),
  async (form) => {
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    await postJSON("/api/signup", { username, email: form.elements.email.value.trim(), password });
    // /api/signup doesn't start a session, so log in straight after
    await postJSON("/api/login", { username, password });
  },
  "Account created! Next: connect Steam…",
  "connect-steam.html"
);

setupForm(
  document.querySelector("#signin-form"),
  // The backend's login accepts a username OR an email in the "username" field
    (form) => postJSON("/api/login", {
    username: form.elements.login.value.trim(),
    password: form.elements.password.value,
  }),
  "Signed in! Taking you home…",
  "home.html"
);