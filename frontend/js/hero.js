/* ============================================================
   The 404 guard: the scarf hero standing watch over missing pages.
   The looks (files, frame counts, speeds) are all in hero.css.

   Used by:
     heroGuard(container)   404.html and the profile not-found view
     (or just put <div data-hero="guard"></div> in the HTML)
   ============================================================ */

const HERO_LOOPS = ["idle"];

// Where the sheets are, worked out from where this file is (js/ → img/fighters/),
// so it also works on 404.html when the address is something like /u/nobody/x
const HERO_IMG_DIR = new URL("../img/fighters/", document.currentScript.src);
const heroReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Building blocks ---------- */

// Makes <div class="hero-fig"><div class="hero-sprite"></div></div>
function createHero() {
  const fig = document.createElement("div");
  fig.className = "hero-fig";
  fig.setAttribute("aria-hidden", "true"); // decoration: the text next to him says what's happening

  const sprite = document.createElement("div");
  sprite.className = "hero-sprite";
  fig.append(sprite);

  return { fig, sprite };
}

// Plays one sheet. Idle loops; one-shots stop on their last frame
// and then call onDone (that's how slash → sheathe is chained).
function heroPlay(sprite, name, onDone) {
  const sheet = heroReduceMotion ? "still" : name;
  const loops = HERO_LOOPS.includes(sheet);

  // Forget the previous sheet's "when you finish" callback
  if (sprite.heroOnEnd) sprite.removeEventListener("animationend", sprite.heroOnEnd);
  sprite.heroOnEnd = null;

  sprite.dataset.sheet = sheet;
  sprite.classList.remove("is-looping", "is-once");
  void sprite.offsetWidth; // forces the browser to restart the animation from frame 1

  if (sheet === "still") {
    if (onDone) setTimeout(onDone, 0);
    return;
  }

  sprite.classList.add(loops ? "is-looping" : "is-once");
  if (!onDone) return;

  if (loops) {
    setTimeout(onDone, 0);
    return;
  }

  sprite.heroOnEnd = (event) => {
    if (event.animationName !== "hero-frames") return;
    sprite.removeEventListener("animationend", sprite.heroOnEnd);
    sprite.heroOnEnd = null;
    onDone();
  };
  sprite.addEventListener("animationend", sprite.heroOnEnd);
}

// Downloads every sheet once so the first swing doesn't blink
(function preloadHeroSheets() {
  ["idle", "slash", "sheathe", "still"].forEach((name) => {
    const img = new Image();
    img.src = new URL(`hero-${name}.png`, HERO_IMG_DIR);
  });
})();

/* ---------- The 404 guard ----------
   Every click plays the full combo: slash, then sheathe, then idle.
   Clicking mid-slash is ignored so the swing always finishes.
   Clicking while he sheathes cuts it short and swings again. */

function heroGuard(container) {
  const scene = document.createElement("div");
  scene.className = "hero-guard";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hero-guard__button";
  button.setAttribute("aria-label", "Attack");

  const { fig, sprite } = createHero();
  const dmg = document.createElement("span");
  dmg.className = "hero-guard__dmg";
  dmg.setAttribute("aria-hidden", "true");
  dmg.textContent = "-404";
  button.append(fig, dmg);

  const hits = document.createElement("p");
  hits.className = "hero-guard__hits";
  hits.textContent = "Click him.";

  scene.append(button, hits);
  container.replaceChildren(scene);

  let count = 0;
  let phase = "idle"; // idle | slash | sheathe
  heroPlay(sprite, "idle");

  button.addEventListener("click", () => {
    if (phase === "slash") return;

    phase = "slash";
    count += 1;
    hits.textContent = `Hits landed: ${count}`;

    // restart the floating "-404"
    dmg.classList.remove("is-hit");
    void dmg.offsetWidth;
    dmg.classList.add("is-hit");

    heroPlay(sprite, "slash", () => {
      phase = "sheathe";
      heroPlay(sprite, "sheathe", () => {
        phase = "idle";
        heroPlay(sprite, "idle");
      });
    });
  });
}

/* ---------- Auto start ----------
   <div data-hero="guard"></div> anywhere in the HTML becomes the guard.
   (Scripts are deferred, so the page is already there when this runs.) */
document.querySelectorAll('[data-hero="guard"]').forEach(heroGuard);