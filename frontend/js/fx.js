/* ============================================================
   Hangout FX: scroll-in, 8-bit sounds, toasts
   (page transitions are pure CSS, in fx.css)

   Everything is wrapped in a function so its variable names can't
   clash with the page's own scripts. Only playSound and showToast
   are shared on purpose (see the bottom).
   ============================================================ */
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Scroll-in animations ---------- */

  // Sections that animate in. No HTML changes needed:
  // any page that has these classes gets the effect.
  const REVEAL_SELECTOR = [
    ".hero__text", ".carousel", ".step",
    ".auth",
    ".home__intro", ".card", ".recs",
    ".profile-head", ".stats", ".tabs",
    ".panel", ".settings-nav",
    ".setup-steps", ".connect-card",
  ].join(", ");

  function setupReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;

    const items = [...document.querySelectorAll(REVEAL_SELECTOR)];
    if (items.length === 0) return;

    items.forEach((el) => {
      el.classList.add("reveal");

      // Stagger neighbours: the 2nd card starts a little after the 1st, and so on
      const siblings = [...el.parentElement.children].filter((child) => child.matches(REVEAL_SELECTOR));
      el.style.transitionDelay = `${Math.min(siblings.indexOf(el), 4) * 80}ms`;

      // Anything already on screen stays visible, so nothing flickers on load
      const box = el.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) el.classList.add("is-revealed");
    });

    document.documentElement.classList.add("fx-reveal");

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target); // only animate once
        }
      });
    }, { threshold: 0.15 });

    items
      .filter((el) => !el.classList.contains("is-revealed"))
      .forEach((el) => observer.observe(el));
  }

  /* ---------- 8-bit sounds ----------
     Made with the Web Audio API: the browser generates the beeps itself,
     so there are no sound files. Off by default. */

  const SOUND_KEY = "hangout-sfx";
  let soundOn = false;
  try {
    soundOn = localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    // Storage blocked (private mode etc.): sound just starts off
  }

  let audio = null; // created on first use; browsers only allow sound after a click

  // Each note is [frequency in Hz, length in seconds]
  const SOUNDS = {
    click:   { wave: "square",   notes: [[880, 0.04]] },
    success: { wave: "square",   notes: [[660, 0.07], [880, 0.07], [1320, 0.12]] },
    error:   { wave: "sawtooth", notes: [[180, 0.09], [140, 0.14]] },
    unlock:  { wave: "square",   notes: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.22]] },

    // Hangout Quest (game.js)
    jump:    { wave: "square",   notes: [[440, 0.05], [660, 0.07]] },
    coin:    { wave: "square",   notes: [[988, 0.05], [1319, 0.12]] },
    slash:   { wave: "sawtooth", notes: [[600, 0.03], [300, 0.05]] },
    hit:     { wave: "square",   notes: [[330, 0.05], [220, 0.06]] },
    stomp:   { wave: "square",   notes: [[220, 0.05], [110, 0.10]] },
    bump:    { wave: "square",   notes: [[150, 0.06]] },
    hurt:    { wave: "sawtooth", notes: [[300, 0.08], [200, 0.12]] },
    clear:   { wave: "square",   notes: [[523, 0.10], [659, 0.10], [784, 0.10], [1047, 0.30]] },
    over:    { wave: "triangle", notes: [[392, 0.15], [330, 0.15], [262, 0.35]] },
  };

  function playSound(name) {
    const sound = SOUNDS[name];
    if (!soundOn || !sound) return;

    audio = audio || new AudioContext();
    let time = audio.currentTime;

    sound.notes.forEach(([frequency, length]) => {
      const oscillator = audio.createOscillator(); // makes the tone
      const volume = audio.createGain();           // controls how loud it is

      oscillator.type = sound.wave;
      oscillator.frequency.value = frequency;

      // Start quiet (square waves are harsh) and fade out quickly
      volume.gain.setValueAtTime(0.06, time);
      volume.gain.exponentialRampToValueAtTime(0.001, time + length);

      oscillator.connect(volume).connect(audio.destination);
      oscillator.start(time);
      oscillator.stop(time + length);
      time += length; // next note starts when this one ends
    });
  }

  function setupSoundToggle() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sound-toggle";
    button.textContent = "♪ SFX";

    function update() {
      button.setAttribute("aria-pressed", soundOn);
      button.title = soundOn ? "Sound effects on" : "Sound effects off";
    }

    button.addEventListener("click", () => {
      soundOn = !soundOn;
      try {
        localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
      } catch {
        // Not saved, but still works for this page
      }
      update();
      playSound("click");
    });

    update();
    nav.prepend(button);
  }

  // A click sound for buttons, links, chips and tabs, on every page
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, a, .chip, .tab");
    if (!target) return;
    if (target.classList.contains("sound-toggle")) return;  // has its own sound
    if (target.matches('button[type="submit"]')) return;    // forms get success/error instead
    playSound("click");
  });

  // Forms: the page's own submit code runs first and marks bad fields with
  // aria-invalid="true". By the time the event reaches the document, we can
  // check the result and play the matching sound.
  document.addEventListener("submit", (event) => {
    const hasErrors = event.target.querySelector('[aria-invalid="true"]');
    playSound(hasErrors ? "error" : "success");
  });
    /* ---------- Day / night theme ---------- */
  // theme-init.js already picked the theme before the page was drawn.
  // This just adds the button that flips it.

  const THEME_KEY = "hangout-theme";

  function setupThemeToggle() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.textContent = "☾ Night";

    function update() {
      button.setAttribute("aria-pressed", document.documentElement.dataset.theme === "night");
    }

    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // not saved, but still switches for this page
      }
      update();
    });

    update();
    nav.prepend(button);
  }

  /* ---------- Toasts ---------- */

  let toastStack = null;

  function setupToasts() {
    toastStack = document.createElement("div");
    toastStack.className = "toast-stack";
    toastStack.setAttribute("role", "status"); // screen readers announce new toasts
    document.body.append(toastStack);
  }

  function showToast({ title, text, icon = "★", sound = "unlock" }) {
    const toast = document.createElement("div");
    toast.className = "toast";

    const badge = document.createElement("span");
    badge.className = "toast__icon";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = icon;

    const body = document.createElement("div");
    body.className = "toast__body";

    const titleEl = document.createElement("span");
    titleEl.className = "toast__title";
    titleEl.textContent = title;

    const textEl = document.createElement("span");
    textEl.className = "toast__text";
    textEl.textContent = text;

    body.append(titleEl, textEl);
    toast.append(badge, body);
    toastStack.append(toast);
    playSound(sound);

    // Slide out after 4 seconds, then remove it from the page
    setTimeout(() => {
      toast.classList.add("is-leaving");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }, 4000);
  }

  /* ---------- Start ---------- */

  setupReveal();
  setupSoundToggle();
  setupThemeToggle();
  setupToasts();

  // Shared with the page scripts (achievements will use these)
  window.playSound = playSound;
  window.showToast = showToast;
})();