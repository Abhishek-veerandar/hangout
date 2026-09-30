// Runs BEFORE the page is drawn (no defer!), so the right theme shows
// straight away instead of flashing the other colours for a moment.
(function () {
  let theme = null;
  try {
    theme = localStorage.getItem("hangout-theme");
  } catch {
    // storage blocked: fall back to the system setting below
  }

  // First visit: follow the computer's dark/light mode setting
  if (theme !== "day" && theme !== "night") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
  }

  document.documentElement.dataset.theme = theme;
})();
