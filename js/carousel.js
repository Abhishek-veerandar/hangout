function setupCarousel(root) {
  const viewport = root.querySelector(".carousel__viewport");
  const slides = [...root.querySelectorAll(".slide")];
  const counter = root.querySelector(".carousel__counter");
  const prevButton = root.querySelector('[data-dir="prev"]');
  const nextButton = root.querySelector('[data-dir="next"]');
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let current = 0;
  let timerId = null;   // saved so we can cancel it (the "reset" part)
  let typingId = null;
  let paused = false;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function show(index, direction) {
    slides[current].classList.remove("is-active", "enter-left", "enter-right");

    // Wrap around both ways. Adding slides.length first stops -1 from
    // staying negative: (-1 + 3) % 3 = 2, the last slide.
    current = (index + slides.length) % slides.length;

    const slide = slides[current];
    void slide.offsetWidth; // forces the browser to restart the animation
    slide.classList.add("is-active", direction === "prev" ? "enter-left" : "enter-right");

    counter.textContent = pad(current + 1) + " / " + pad(slides.length);
    startTyping(slide);
    schedule();
  }

  // Each slide has its own duration, so we use setTimeout (one shot)
  // instead of setInterval (same delay forever).
  function schedule() {
    clearTimeout(timerId);
    if (reduceMotion || paused) return;

    const duration = Number(slides[current].dataset.duration) || 3000;
    timerId = setTimeout(() => show(current + 1, "next"), duration);
  }

  function startTyping(slide) {
    clearInterval(typingId);
    const target = slide.querySelector(".typewriter");
    if (!target) return;

    // Remember the full text the first time we see it
    const text = target.dataset.text ?? (target.dataset.text = target.textContent.trim());

    if (reduceMotion) {
      target.textContent = text;
      return;
    }

    let i = 0;
    target.textContent = "";
    typingId = setInterval(() => {
      i++;
      target.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typingId);
    }, 60);
  }

  // Clicking an arrow changes the slide; show() calls schedule(),
  // which clears the old timer, so the countdown starts fresh.
  prevButton.addEventListener("click", () => show(current - 1, "prev"));
  nextButton.addEventListener("click", () => show(current + 1, "next"));

  // Left/right arrow keys while focus is anywhere in the carousel
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(current - 1, "prev");
    if (event.key === "ArrowRight") show(current + 1, "next");
  });

  // Pause while someone is reading the slide (mouse over it or tabbed into it).
  // The arrows are outside the viewport, so clicking them still resets the timer.
  function pause() {
    paused = true;
    clearTimeout(timerId);
  }
  function resume() {
    paused = false;
    schedule();
  }

  viewport.addEventListener("mouseenter", pause);
  viewport.addEventListener("mouseleave", resume);
  viewport.addEventListener("focusin", pause);
  viewport.addEventListener("focusout", (event) => {
    if (!viewport.contains(event.relatedTarget)) resume();
  });

  show(0, "next");
}

document.querySelectorAll(".carousel").forEach(setupCarousel);