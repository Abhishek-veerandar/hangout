/* ============================================================
   Hangout Quest: a small side-scrolling platformer
   Adds a "▶ Play" button to the header and opens the game in a popup.

   Controls: ← → or A D move · Space / W / ↑ jump · J or X slash · P pause
   Levels:   3 maps that repeat; every level the samurai get faster and
             take one more hit (2 on level 1, up to 5)
   Score:    coin 100 · star block 100 · samurai 200 × level
             level bonus: time left × 10 + hearts × 500
   Best score is saved in this browser for now (later: the backend).
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Settings ---------- */

  const W = 480;           // the game is drawn at 480 × 270, then scaled up
  const H = 270;
  const T = 16;            // one tile is 16 × 16
  const STEP = 1 / 120;    // physics runs 120 times a second, whatever the screen does
  const START_TIME = 200;  // seconds on the clock
  const BEST_KEY = "hangout-arcade-best";

  const PHYS = {
    accel: 1100,     // how fast he speeds up
    friction: 1300,  // how fast he stops
    maxRun: 140,     // top speed, pixels per second
    gravity: 1400,
    jumpSpeed: 500,  // about 5 tiles high
    jumpCut: 180,    // let go of jump early = shorter jump
    maxFall: 520,
    slashCooldown: 0.5, // seconds from one swing to the next (the swing itself takes 0.21)
    coyote: 0.08,    // you can still jump just after running off a ledge
    buffer: 0.12,    // a jump pressed just before landing still counts
  };

  const SPRITE_DIR = new URL("../img/fighters/", document.currentScript.src);

  // Every sheet is one row of square frames (frame size = image height)
  const SHEETS = {
    heroIdle:    { file: "hero-idle.png",      frames: 10, ms: 100, loop: true },
    heroRun:     { file: "hero-run.png",       frames: 10, ms: 60,  loop: true },
    heroRise:    { file: "hero-rise.png",      frames: 4,  ms: 90,  loop: true },
    heroFall:    { file: "hero-fall.png",      frames: 3,  ms: 100, loop: true },
    heroSlash:   { file: "hero-slash.png",     frames: 3,  ms: 70 },
    heroSheathe: { file: "hero-sheathe.png",   frames: 4,  ms: 90 },
    samIdle:     { file: "samurai-idle.png",   frames: 10, ms: 100, loop: true },
    samRun:      { file: "samurai-run.png",    frames: 16, ms: 45,  loop: true },
    samAttack:   { file: "samurai-attack.png", frames: 7,  ms: 85 },
    samHurt:     { file: "samurai-hurt.png",   frames: 4,  ms: 90 },
  };

  // Where each character's feet are inside his frame (found from the sheets)
  const HERO_ANCHOR = { x: 57, y: 80 };
  const SAM_ANCHOR = { x: 48, y: 81 };

  const SOLID = new Set(["#", "B", "*", "U", "P"]);

  /* ---------- Levels ----------
     Three hand-made maps. After level 3 they repeat, but the samurai
     keep getting faster and tougher (see difficulty() below).
     Rows go 0 (top) to 16 (bottom); the ground is rows 15 and 16. */

  const LEVELS = [
    {
      name: "The Village Road",
      cols: 200,
      flag: 186,
      build({ ground, gap, line, set, pillar, stairs, coinRow, samurai }) {
        ground(0, 199);
        coinRow(8, 10, 12);
        set(14, 11, "*");
        line(16, 18, 11, "B");
        set(17, 11, "*");
        set(17, 7, "*");
        samurai(26);

        gap(35, 37);
        pillar(44, 2);
        samurai(52);
        line(56, 61, 10, "B");
        coinRow(56, 61, 9);
        pillar(64, 3);

        gap(71, 74);
        line(72, 73, 12, "B");
        stairs(80, 4, 1);
        gap(84, 86);
        stairs(87, 4, -1);
        samurai(96);
        set(98, 11, "*");
        set(100, 11, "*");
        coinRow(98, 100, 8);
        samurai(104);

        line(113, 114, 12, "B");
        line(116, 123, 9, "B");
        coinRow(116, 123, 8);
        samurai(120, 9);
        samurai(130);
        pillar(134, 3);

        gap(141, 143);
        samurai(152);
        set(156, 11, "*");
        set(157, 11, "*");
        samurai(162);
        stairs(168, 8, 1);
        coinRow(178, 181, 5);
      },
    },
    {
      name: "The Rope Bridges",
      cols: 220,
      flag: 200,
      build({ ground, gap, line, set, pillar, stairs, coinRow, samurai }) {
        ground(0, 219);
        samurai(16);

        gap(21, 24);
        line(21, 24, 12, "B");
        coinRow(21, 24, 11);
        set(30, 11, "*");
        samurai(34);
        samurai(42);
        pillar(46, 3);

        gap(51, 56);
        line(53, 54, 13, "B");
        line(62, 67, 11, "B");
        coinRow(62, 67, 10);
        samurai(64, 11);
        samurai(70);
        samurai(78);
        set(84, 11, "*");
        set(85, 11, "*");

        gap(91, 93);
        stairs(98, 5, 1);
        line(103, 110, 10, "B");
        coinRow(103, 110, 9);
        samurai(106, 10);
        stairs(111, 5, -1);
        samurai(120);
        samurai(126);

        gap(131, 134);
        line(132, 133, 11, "B");
        pillar(140, 2);
        samurai(143);
        pillar(146, 4);
        samurai(152);
        samurai(156);
        line(155, 157, 11, "*");
        line(159, 160, 11, "B");
        line(162, 168, 8, "B");
        coinRow(162, 168, 7);
        samurai(165, 8);
        samurai(172);
        samurai(178);
        stairs(184, 8, 1);
      },
    },
    {
      name: "The Castle Steps",
      cols: 240,
      flag: 214,
      build({ ground, gap, line, set, pillar, stairs, coinRow, samurai }) {
        ground(0, 239);
        samurai(14);
        samurai(20);
        pillar(25, 2);

        gap(28, 31);
        samurai(36);
        samurai(40);
        line(44, 49, 11, "B");
        set(46, 7, "*");
        samurai(47, 11);
        coinRow(44, 49, 10);
        samurai(54);
        samurai(58);

        gap(61, 65);
        set(63, 12, "B");
        stairs(70, 4, 1);
        pillar(78, 4);
        samurai(82);
        samurai(86);
        samurai(90);
        line(94, 96, 11, "*");

        gap(101, 104);
        line(107, 108, 12, "B");
        line(110, 125, 9, "B");
        coinRow(110, 125, 8);
        samurai(114, 9);
        samurai(120, 9);
        samurai(112);
        samurai(118);
        samurai(124);

        gap(151, 155);
        set(153, 12, "B");
        pillar(160, 3);
        samurai(164);
        samurai(168);
        samurai(172);
        pillar(176, 3);
        samurai(182);
        samurai(186);
        set(190, 11, "*");
        stairs(196, 8, 1);
        coinRow(205, 208, 5);
        samurai(208);
      },
    },
  ];

  // How hard level n is. Level 1 = 2 hits per samurai, then +1 hit each level (max 5),
  // and they walk, chase, see and swing faster every level.
  function difficulty(n) {
    const step = n - 1;
    return {
      hp: Math.min(2 + step, 5),
      walk: Math.min(34 + step * 8, 70),
      chase: Math.min(62 + step * 18, 130),   // the hero's top speed is 140
      sight: Math.min(150 + step * 20, 260),
      cooldown: Math.max(0.35, 0.9 - step * 0.15),
      swing: Math.min(1 + step * 0.15, 1.6), // how much faster the attack animation plays
      points: 200 * n,
    };
  }

  function buildLevel(n) {
    const plan = LEVELS[(n - 1) % LEVELS.length];
    const rows = 17;
    const cols = plan.cols;
    const map = Array.from({ length: rows }, () => Array(cols).fill(" "));
    const coins = [];
    const enemies = [];

    const set = (c, r, tile) => { if (r >= 0 && r < rows && c >= 0 && c < cols) map[r][c] = tile; };
    const line = (from, to, r, tile) => { for (let c = from; c <= to; c++) set(c, r, tile); };
    const ground = (from, to) => { line(from, to, 15, "#"); line(from, to, 16, "#"); };
    const gap = (from, to) => { line(from, to, 15, " "); line(from, to, 16, " "); };
    const pillar = (c, height) => { for (let i = 1; i <= height; i++) { set(c, 15 - i, "P"); set(c + 1, 15 - i, "P"); } };
    const stairs = (from, steps, dir) => {
      for (let i = 0; i < steps; i++) {
        const c = dir > 0 ? from + i : from + steps - 1 - i;
        for (let r = 14; r >= 14 - i; r--) set(c, r, "B");
      }
    };
    const coinRow = (from, to, r) => { for (let c = from; c <= to; c++) coins.push({ x: c * T + 8, y: r * T + 8, taken: false }); };
    const samurai = (c, r = 15) => enemies.push({ c, r });

    plan.build({ ground, gap, line, set, pillar, stairs, coinRow, samurai });
    set(plan.flag, 14, "P"); // the banner's base block

    return {
      number: n,
      name: plan.name,
      cols, rows, map, coins, enemies,
      flagX: plan.flag * T + 8,
      goalX: plan.flag * T - 10, // touching the base block ends the level
      width: cols * T,
      diff: difficulty(n),
    };
  }

  /* ---------- Small helpers ---------- */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const box = (e) => ({ l: e.x - e.w / 2, r: e.x + e.w / 2, t: e.y - e.h, b: e.y });
  const sound = (name) => { if (window.playSound) window.playSound(name); };

  function readBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
  }

  function saveBest(score) {
    try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* not saved, still shown */ }
    // Let the page know (profile.js updates the "Arcade best" stat)
    document.dispatchEvent(new CustomEvent("arcade:best", { detail: { score } }));
  }

  /* ---------- Colors come from the site's theme ---------- */

  let pal = null;

  function readPalette() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const bg = v("--bg", "#F5DDA6");
    pal = {
      bg,
      surface: v("--surface", "#FBEFD0"),
      ink: v("--ink", "#300F0A"),
      muted: v("--muted", "#803520"),
      accent: v("--accent", "#1E1573"),
      yellow: v("--yellow", "#F0D71E"),
      danger: v("--danger", "#A02018"),
      night: isDark(bg),
    };
    tiles = null; // repaint the tiles in the new colors
  }

  function isDark(color) {
    const hex = color.replace("#", "");
    if (hex.length !== 6) return false;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return (r * 0.299 + g * 0.587 + b * 0.114) < 110;
  }

  /* ---------- Tiles, painted pixel by pixel ---------- */

  let tiles = null;

  function paintTiles() {
    const kinds = ["groundTop", "ground", "brick", "star", "used", "pillarTop", "pillar"];
    tiles = {};
    kinds.forEach((kind) => {
      const c = document.createElement("canvas");
      c.width = T;
      c.height = T;
      const g = c.getContext("2d");
      const px = (x, y, w, h, color, alpha = 1) => { g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(x, y, w, h); g.globalAlpha = 1; };

      if (kind === "groundTop" || kind === "ground") {
        px(0, 0, 16, 16, pal.muted);
        if (kind === "groundTop") {
          px(0, 0, 16, 4, pal.surface);
          px(0, 4, 16, 1, pal.ink);
          px(0, 9, 16, 1, pal.ink, 0.35);
          px(5, 5, 1, 4, pal.ink, 0.35);
          px(12, 10, 1, 6, pal.ink, 0.35);
        } else {
          px(0, 3, 16, 1, pal.ink, 0.35);
          px(0, 11, 16, 1, pal.ink, 0.35);
          px(5, 4, 1, 7, pal.ink, 0.35);
          px(12, 12, 1, 4, pal.ink, 0.35);
          px(12, 0, 1, 3, pal.ink, 0.35);
        }
      } else if (kind === "brick") {
        px(0, 0, 16, 16, pal.ink);
        px(1, 1, 14, 6, pal.danger);
        px(1, 8, 6, 7, pal.danger);
        px(8, 8, 7, 7, pal.danger);
        px(1, 1, 14, 1, pal.surface, 0.35);
      } else if (kind === "star" || kind === "used") {
        px(0, 0, 16, 16, pal.ink);
        px(1, 1, 14, 14, kind === "star" ? pal.yellow : pal.muted);
        px(2, 2, 1, 1, pal.ink); px(13, 2, 1, 1, pal.ink); px(2, 13, 1, 1, pal.ink); px(13, 13, 1, 1, pal.ink);
        if (kind === "star") {
          // a little pixel star
          px(7, 4, 2, 2, pal.ink);
          px(4, 6, 8, 2, pal.ink);
          px(6, 8, 4, 2, pal.ink);
          px(5, 10, 2, 2, pal.ink);
          px(9, 10, 2, 2, pal.ink);
        }
      } else {
        px(0, 0, 16, 16, pal.ink);
        px(2, 0, 12, 16, pal.surface);
        px(5, 0, 1, 16, pal.ink, 0.18);
        px(10, 0, 1, 16, pal.ink, 0.18);
        if (kind === "pillarTop") {
          px(0, 0, 16, 4, pal.ink);
          px(1, 1, 14, 2, pal.surface);
        }
      }
      tiles[kind] = c;
    });
  }

  /* ---------- Game state ---------- */

  let canvas, ctx, hud, overlay, dialog, playButton;
  let level, hero, enemies, coins, popups, sparks, bumps;
  let state = "loading"; // loading | title | play | pause | over | clear
  let cam = 0, score = 0, coinCount = 0, timeLeft = START_TIME, best = readBest();
  let raf = 0, lastTime = 0, acc = 0;

  const keys = { left: false, right: false, jump: false, jumpPressed: false, slashPressed: false };

  // A new run: score back to 0, full hearts, level 1
  function newGame() {
    score = 0;
    coinCount = 0;
    loadLevel(1, 3);
  }

  // Score and coins carry over from level to level; hearts are passed in
  function loadLevel(n, hearts) {
    level = buildLevel(n);
    hero = {
      x: 3 * T, y: 15 * T, w: 14, h: 34, vx: 0, vy: 0,
      facing: 1, onGround: false, coyote: 0, buffer: 0,
      hearts, invuln: 0, slashT: -1, slashCool: 0, hits: null, sheathing: false,
      safeX: 3 * T, safeY: 15 * T, anim: { sheet: "heroIdle", t: 0 },
    };
    enemies = level.enemies.map(({ c, r }) => ({
      x: c * T + 8, y: r * T, w: 16, h: 30, vx: 0, vy: 0, dir: -1,
      hp: level.diff.hp, maxHp: level.diff.hp, knock: 0, hurtT: 0,
      state: "walk", cool: 0, dead: false, deadT: 0, onGround: false,
      anim: { sheet: "samRun", t: Math.random() * 500 },
    }));
    coins = level.coins.map((coin) => ({ ...coin }));
    popups = [];
    sparks = [];
    bumps = [];
    cam = 0;
    timeLeft = START_TIME;
    // forget taps from the menu, but keep keys that are still held down
    keys.jumpPressed = false;
    keys.slashPressed = false;
  }

  /* ---------- Animation helpers ---------- */

  function setAnim(entity, sheet) {
    if (entity.anim.sheet !== sheet) entity.anim = { sheet, t: 0 };
  }

  function animFrame(anim) {
    const s = SHEETS[anim.sheet];
    const i = Math.floor(anim.t / s.ms);
    return s.loop ? i % s.frames : Math.min(i, s.frames - 1);
  }

  function animDone(anim) {
    const s = SHEETS[anim.sheet];
    return !s.loop && anim.t >= s.frames * s.ms;
  }

  /* ---------- Tile collisions ---------- */

  function tileAt(c, r) {
    if (c < 0 || c >= level.cols) return "#"; // invisible walls at both ends
    if (r < 0 || r >= level.rows) return " ";
    return level.map[r][c];
  }

  function solidAt(x, y) {
    return SOLID.has(tileAt(Math.floor(x / T), Math.floor(y / T)));
  }

  function hitsColumn(x, top, bottom) {
    for (let y = top; y < bottom; y += T) if (solidAt(x, y)) return true;
    return solidAt(x, bottom);
  }

  function hitsRow(y, left, right) {
    for (let x = left; x < right; x += T) if (solidAt(x, y)) return true;
    return solidAt(right, y);
  }

  // Moves a body: sideways first, then up/down, stopping at solid tiles
  function moveBody(b, dt, onHeadHit) {
    b.hitWall = false;
    b.x += b.vx * dt;
    const top = b.y - b.h + 1;
    const bottom = b.y - 1;

    if (b.vx > 0 && hitsColumn(b.x + b.w / 2, top, bottom)) {
      b.x = Math.floor((b.x + b.w / 2) / T) * T - b.w / 2 - 0.01;
      b.vx = 0;
      b.hitWall = true;
    } else if (b.vx < 0 && hitsColumn(b.x - b.w / 2, top, bottom)) {
      b.x = (Math.floor((b.x - b.w / 2) / T) + 1) * T + b.w / 2 + 0.01;
      b.vx = 0;
      b.hitWall = true;
    }

    b.vy = Math.min(b.vy + PHYS.gravity * dt, PHYS.maxFall);
    b.y += b.vy * dt;
    b.onGround = false;
    const left = b.x - b.w / 2 + 1;
    const right = b.x + b.w / 2 - 1;

    if (b.vy > 0 && hitsRow(b.y, left, right)) {
      b.y = Math.floor(b.y / T) * T;
      b.vy = 0;
      b.onGround = true;
    } else if (b.vy < 0 && hitsRow(b.y - b.h, left, right)) {
      const row = Math.floor((b.y - b.h) / T);
      b.y = (row + 1) * T + b.h;
      b.vy = 0;
      if (onHeadHit) onHeadHit(row, left, right);
    }
  }

  /* ---------- Hero ---------- */

  function hitStarBlock(row, left, right) {
    // Prefer the block right above his head, then the edges
    const cols = [Math.floor(hero.x / T), Math.floor(left / T), Math.floor(right / T)];
    for (const c of cols) {
      const tile = tileAt(c, row);
      if (tile === "*") {
        level.map[row][c] = "U";
        bumps.push({ c, r: row, t: 0 });
        sparks.push({ x: c * T + 8, y: row * T - 4, vy: -220, t: 0 });
        addScore(100, c * T + 8, row * T - 8);
        coinCount += 1;
        sound("coin");
        return;
      }
      if (tile === "B" || tile === "U") {
        bumps.push({ c, r: row, t: 0 });
        sound("bump");
        return;
      }
    }
  }

  function hurtHero(fromX) {
    if (hero.invuln > 0 || state !== "play") return;
    hero.hearts -= 1;
    hero.invuln = 1.3;
    hero.vx = (hero.x < fromX ? -1 : 1) * 170;
    hero.vy = -240;
    sound("hurt");
    if (hero.hearts <= 0) gameOver();
  }

  function updateHero(dt) {
    const h = hero;
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

    // Running
    if (dir !== 0) {
      const turning = Math.sign(h.vx) === -dir;
      h.vx += dir * (turning ? PHYS.accel + PHYS.friction : PHYS.accel) * dt;
      h.facing = dir;
      h.sheathing = false;
    } else {
      const slow = PHYS.friction * dt;
      h.vx = Math.abs(h.vx) <= slow ? 0 : h.vx - Math.sign(h.vx) * slow;
    }
    h.vx = clamp(h.vx, -PHYS.maxRun, PHYS.maxRun);

    // Jumping (with a little forgiveness on both sides)
    h.coyote = h.onGround ? PHYS.coyote : h.coyote - dt;
    h.buffer = keys.jumpPressed ? PHYS.buffer : h.buffer - dt;
    if (h.buffer > 0 && h.coyote > 0) {
      h.vy = -PHYS.jumpSpeed;
      h.buffer = 0;
      h.coyote = 0;
      h.sheathing = false;
      sound("jump");
    }
    if (!keys.jump && h.vy < -PHYS.jumpCut) h.vy = -PHYS.jumpCut;

    // Slashing, with a cooldown so it can't be spammed
    h.slashCool = Math.max(0, h.slashCool - dt);
    if (keys.slashPressed && h.slashT < 0 && h.slashCool <= 0) {
      h.slashT = 0;
      h.slashCool = PHYS.slashCooldown;
      h.hits = new Set();
      h.sheathing = false;
      sound("slash");
    }

    const prevBottom = h.y;
    moveBody(h, dt, hitStarBlock);

    // Remember the last safe spot, for falling into a pit
    if (h.onGround && solidAt(h.x - 6, h.y + 2) && solidAt(h.x + 6, h.y + 2)) {
      h.safeX = h.x;
      h.safeY = h.y;
    }

    if (h.slashT >= 0) {
      h.slashT += dt * 1000;
      const slashMs = SHEETS.heroSlash.frames * SHEETS.heroSlash.ms;
      if (h.slashT >= slashMs) {
        h.slashT = -1;
        if (h.onGround && dir === 0) h.sheathing = true; // put the sword back if standing still
      }
    }

    h.invuln = Math.max(0, h.invuln - dt);

    // Fell in a pit
    if (h.y > H + 40) {
      hero.invuln = 0;
      hurtHero(h.x);
      if (state === "play") {
        // step back a little from the edge he fell off
        const back = h.safeX - h.facing * 24;
        h.x = solidAt(back, h.safeY + 2) ? back : h.safeX;
        h.y = h.safeY;
        h.vx = 0;
        h.vy = 0;
        h.invuln = 1.5;
      }
    }

    // Coins
    const hb = box(h);
    coins.forEach((coin) => {
      if (!coin.taken && overlap(hb, { l: coin.x - 5, r: coin.x + 5, t: coin.y - 6, b: coin.y + 6 })) {
        coin.taken = true;
        coinCount += 1;
        addScore(100, coin.x, coin.y - 6);
        sound("coin");
      }
    });

    // Enemies: stomp, slash, or get hurt
    enemies.forEach((e) => {
      if (e.dead) return;
      const eb = box(e);

      if (h.slashT >= SHEETS.heroSlash.ms && !h.hits.has(e)) {
        const reach = h.facing > 0 ? { l: h.x, r: h.x + 44 } : { l: h.x - 44, r: h.x };
        if (overlap({ ...reach, t: h.y - 32, b: h.y - 2 }, eb)) {
          h.hits.add(e); // one swing = one hit, even if he's in range for several frames
          hitEnemy(e, h.x);
          return;
        }
      }

      if (overlap(hb, eb)) {
        if (h.vy > 0 && prevBottom <= eb.t + 6) {
          hitEnemy(e, h.x); // a stomp counts as one hit too
          h.vy = keys.jump ? -440 : -300;
        } else if (e.state !== "hurt") {
          hurtHero(e.x); // a samurai that's reeling from a hit can't hurt you
        }
      }
    });

    // Reached the flag
    if (h.x >= level.goalX && state === "play") levelClear();

    // Pick his animation
    let sheet;
    if (h.slashT >= 0) sheet = "heroSlash";
    else if (!h.onGround) sheet = h.vy < 0 ? "heroRise" : "heroFall";
    else if (Math.abs(h.vx) > 8) { sheet = "heroRun"; h.sheathing = false; }
    else if (h.sheathing) sheet = "heroSheathe";
    else sheet = "heroIdle";

    setAnim(h, sheet);
    h.anim.t += dt * 1000;
    if (sheet === "heroSheathe" && animDone(h.anim)) h.sheathing = false;
  }

  /* ---------- Samurai ---------- */

  // One hit from a slash or a stomp. Below 0 hp he falls; otherwise he
  // flinches, gets knocked back and can't attack for a moment.
  function hitEnemy(e, fromX) {
    e.hp -= 1;
    if (e.hp <= 0) {
      defeat(e);
      return;
    }
    e.state = "hurt";
    e.hurtT = 0.3;
    e.knock = (e.x < fromX ? -1 : 1) * 150;
    e.vy = -140;
    e.anim = { sheet: "samHurt", t: 0 };
    sound("hit");
  }

  function defeat(e) {
    e.dead = true;
    e.deadT = 0;
    e.vx = 0;
    setAnim(e, "samHurt");
    addScore(level.diff.points, e.x, e.y - 34);
    sound("stomp");
  }

  function updateEnemy(e, dt) {
    if (e.dead) {
      e.deadT += dt;
      e.anim.t += dt * 1000;
      return;
    }
    if (Math.abs(e.x - hero.x) > W) return; // asleep until you get close

    const d = level.diff;
    const dx = hero.x - e.x;
    const near = Math.abs(dx) < d.sight && Math.abs(hero.y - e.y) < 48 && state === "play";
    e.cool -= dt;
    let animSpeed = 1;

    if (e.state === "hurt") {
      e.hurtT -= dt;
      e.vx = e.knock * Math.max(0, e.hurtT / 0.3); // slides back, slowing down
      if (e.hurtT <= 0) {
        e.state = "walk";
        e.cool = Math.max(e.cool, 0.25);
        e.dir = Math.sign(dx) || e.dir;
      }
    } else if (e.state === "attack") {
      e.vx = 0;
      animSpeed = d.swing;
      const f = animFrame(e.anim);
      if (f >= 4 && f <= 5) {
        const reach = e.dir > 0 ? { l: e.x, r: e.x + 40 } : { l: e.x - 40, r: e.x };
        if (overlap({ ...reach, t: e.y - 28, b: e.y - 2 }, box(hero))) hurtHero(e.x);
      }
      if (animDone(e.anim)) {
        e.state = "walk";
        e.cool = d.cooldown;
      }
    } else {
      if (near) e.dir = Math.sign(dx) || e.dir;
      if (near && Math.abs(dx) < 32 && e.cool <= 0 && e.onGround) {
        e.state = "attack";
        e.anim = { sheet: "samAttack", t: 0 };
        e.vx = 0;
      } else {
        e.vx = e.dir * (near ? d.chase : d.walk);
      }
    }

    moveBody(e, dt);
    if (e.hitWall && e.state === "walk") e.dir *= -1;

    // Don't walk off ledges: turn around, or wait at the edge if you're close
    let waiting = false;
    if (e.onGround && e.state === "walk") {
      const ahead = e.x + e.dir * (e.w / 2 + 2);
      if (!solidAt(ahead, e.y + 2)) {
        e.vx = 0;
        if (near) waiting = true;
        else e.dir *= -1;
      }
    }

    if (e.state === "walk") setAnim(e, waiting || e.vx === 0 ? "samIdle" : "samRun");
    e.anim.t += dt * 1000 * animSpeed;
  }

  /* ---------- Score ---------- */

  function addScore(points, x, y) {
    score += points;
    popups.push({ x, y, text: String(points), t: 0 });
  }

  /* ---------- Main update ---------- */

  function update(dt) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      gameOver();
      return;
    }

    updateHero(dt);
    enemies.forEach((e) => updateEnemy(e, dt));
    enemies = enemies.filter((e) => !(e.dead && e.deadT > 0.9));

    popups.forEach((p) => { p.t += dt; p.y -= 24 * dt; });
    popups = popups.filter((p) => p.t < 0.8);
    sparks.forEach((s) => { s.t += dt; s.vy += 900 * dt; s.y += s.vy * dt; });
    sparks = sparks.filter((s) => s.t < 0.45);
    bumps.forEach((b) => { b.t += dt; });
    bumps = bumps.filter((b) => b.t < 0.15);

    // Camera follows him, a bit left of center so you see what's coming
    cam = clamp(hero.x - W * 0.4, 0, level.width - W);

    keys.jumpPressed = false;
    keys.slashPressed = false;
    updateHud();
  }

  /* ---------- Drawing ---------- */

  function drawSprite(entity, anchor, flip) {
    const s = SHEETS[entity.anim.sheet];
    const img = s.img;
    const size = img.height;
    const frame = animFrame(entity.anim);
    const ax = flip ? size - anchor.x : anchor.x;
    const dx = Math.round(entity.x - ax - cam);
    const dy = Math.round(entity.y - anchor.y);

    if (dx > W || dx + size < 0) return;

    if (flip) {
      ctx.save();
      ctx.translate(dx + size, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * size, 0, size, size, 0, 0, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(img, frame * size, 0, size, size, dx, dy, size, size);
    }
  }

  function drawBackground() {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // Night: stars that barely move
    if (pal.night) {
      ctx.fillStyle = pal.surface;
      for (let i = 0; i < 60; i++) {
        const sx = (((i * 97 - cam * 0.05) % W) + W) % W;
        ctx.globalAlpha = i % 3 === 0 ? 0.9 : 0.45;
        ctx.fillRect(Math.round(sx), (i * 53) % 150, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // Far hills: stepped shapes, slow parallax
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.07;
    const shift = cam * 0.3;
    for (let i = -1; i < W / 8 + 2; i++) {
      const world = (i + Math.floor(shift / 8)) * 8; // snapped, so hills don't wobble
      const h = 40 + Math.round(Math.sin(world / 90) * 22 + Math.sin(world / 37) * 8);
      ctx.fillRect(Math.round(i * 8 - (shift % 8)), 240 - h, 8, h);
    }
    ctx.globalAlpha = 1;

    // Clouds
    for (let i = 0; i < 8; i++) {
      const wx = i * 170 + 40;
      const x = Math.round(((wx - cam * 0.5) % 1360 + 1360) % 1360) - 80;
      const y = 30 + (i % 3) * 22;
      ctx.fillStyle = pal.surface;
      ctx.fillRect(x, y, 40, 8);
      ctx.fillRect(x + 8, y - 6, 20, 6);
      ctx.fillStyle = pal.ink;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x, y + 8, 40, 1);
      ctx.globalAlpha = 1;
    }
  }

  function drawTiles() {
    if (!tiles) paintTiles();
    const first = Math.floor(cam / T);
    const last = Math.min(level.cols - 1, first + Math.ceil(W / T) + 1);

    for (let r = 0; r < level.rows; r++) {
      for (let c = first; c <= last; c++) {
        const tile = level.map[r][c];
        if (tile === " ") continue;

        let img;
        const above = tileAt(c, r - 1);
        if (tile === "#") img = above === "#" ? tiles.ground : tiles.groundTop;
        else if (tile === "B") img = tiles.brick;
        else if (tile === "*") img = tiles.star;
        else if (tile === "U") img = tiles.used;
        else if (tile === "P") img = above === "P" ? tiles.pillar : tiles.pillarTop;
        if (!img) continue;

        const bump = bumps.find((b) => b.c === c && b.r === r);
        const lift = bump ? Math.round(Math.sin((bump.t / 0.15) * Math.PI) * 4) : 0;
        ctx.drawImage(img, Math.round(c * T - cam), r * T - lift);
      }
    }
  }

  function drawCoin(x, y, t) {
    const widths = [8, 6, 2, 6];
    const w = widths[Math.floor(t * 8) % 4];
    const dx = Math.round(x - cam - w / 2);
    ctx.fillStyle = pal.ink;
    ctx.fillRect(dx - 1, y - 6, w + 2, 12);
    ctx.fillStyle = pal.yellow;
    ctx.fillRect(dx, y - 5, w, 10);
  }

  function drawFlag(t) {
    const x = Math.round(level.flagX - cam);
    if (x < -40 || x > W + 40) return;
    ctx.fillStyle = pal.ink;
    ctx.fillRect(x - 1, 4 * T, 2, 10 * T);
    ctx.fillRect(x - 3, 4 * T - 4, 6, 4);
    // the banner waves a little
    const wave = Math.floor(t * 4) % 2;
    ctx.fillStyle = pal.danger;
    ctx.fillRect(x + 1, 4 * T + 2, 26 - wave * 2, 14);
    ctx.fillStyle = pal.ink;
    ctx.fillRect(x + 1, 4 * T + 16, 26 - wave * 2, 1);
    ctx.fillStyle = pal.surface;
    ctx.fillRect(x + 8, 4 * T + 5, 2, 8);
    ctx.fillRect(x + 14, 4 * T + 5, 2, 8);
    ctx.fillRect(x + 10, 4 * T + 8, 4, 2);
  }

  // Little squares over his head: one per hit he can still take
  function drawHealth(e) {
    const size = 4;
    const gapX = 2;
    const width = e.maxHp * size + (e.maxHp - 1) * gapX;
    const left = Math.round(e.x - cam - width / 2);
    const top = Math.round(e.y - e.h - 10);
    for (let i = 0; i < e.maxHp; i++) {
      const x = left + i * (size + gapX);
      ctx.fillStyle = pal.ink;
      ctx.fillRect(x - 1, top - 1, size + 2, size + 2);
      ctx.fillStyle = i < e.hp ? pal.danger : pal.bg;
      ctx.fillRect(x, top, size, size);
    }
  }

  // A small bar over his head that fills up until he can slash again
  function drawSlashCooldown() {
    if (hero.slashCool <= 0) return;
    const ready = 1 - hero.slashCool / PHYS.slashCooldown;
    const left = Math.round(hero.x - cam - 8);
    const top = Math.round(hero.y - hero.h - 8);
    ctx.fillStyle = pal.ink;
    ctx.fillRect(left - 1, top - 1, 18, 4);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(left, top, 16, 2);
    ctx.fillStyle = pal.yellow;
    ctx.fillRect(left, top, Math.round(16 * ready), 2);
  }

  let clock = 0;

  function render() {
    drawBackground();
    drawTiles();
    drawFlag(clock);

    coins.forEach((coin) => { if (!coin.taken) drawCoin(coin.x, coin.y, clock); });
    sparks.forEach((s) => drawCoin(s.x, Math.round(s.y), clock * 3));

    enemies.forEach((e) => {
      if (e.dead && Math.floor(e.deadT * 16) % 2 === 1) return; // blink as they go
      if (e.state === "hurt" && Math.floor(e.hurtT * 30) % 2 === 1) return; // flash when hit
      drawSprite(e, SAM_ANCHOR, e.dir < 0);
      if (!e.dead) drawHealth(e);
    });

    const blink = hero.invuln > 0 && Math.floor(hero.invuln * 14) % 2 === 1;
    if (!blink) drawSprite(hero, HERO_ANCHOR, hero.facing < 0);
    drawSlashCooldown();

    ctx.font = "bold 8px 'Space Mono', monospace";
    ctx.textAlign = "center";
    popups.forEach((p) => {
      ctx.fillStyle = pal.ink;
      ctx.fillText(p.text, Math.round(p.x - cam) + 1, Math.round(p.y) + 1);
      ctx.fillStyle = pal.yellow;
      ctx.fillText(p.text, Math.round(p.x - cam), Math.round(p.y));
    });
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    clock += dt;

    if (state === "play") {
      acc += dt;
      while (acc >= STEP && state === "play") {
        update(STEP);
        acc -= STEP;
      }
    } else if (state === "title" && hero) {
      // the title screen still breathes
      hero.anim.t += dt * 1000;
    }

    if (level) render();
  }

  /* ---------- HUD and screens (plain HTML on top of the canvas) ---------- */

  const fmt = new Intl.NumberFormat("en-US");

  function updateHud() {
    hud.level.textContent = `LV ${level.number}`;
    hud.score.textContent = String(score).padStart(6, "0");
    hud.coins.textContent = `● × ${String(coinCount).padStart(2, "0")}`;
    hud.hearts.textContent = "♥".repeat(Math.max(0, hero.hearts)) + "♡".repeat(Math.max(0, 3 - hero.hearts));
    hud.time.textContent = `TIME ${Math.ceil(timeLeft)}`;
    hud.best.textContent = `BEST ${fmt.format(best)}`;
  }

  function showScreen({ title, lines = [], buttons = [] }) {
    overlay.panel.replaceChildren();

    const h = document.createElement("p");
    h.className = "arcade__screen-title";
    h.textContent = title;
    overlay.panel.append(h);

    lines.forEach((text) => {
      const p = document.createElement("p");
      p.className = "arcade__screen-line";
      p.textContent = text;
      overlay.panel.append(p);
    });

    const row = document.createElement("div");
    row.className = "arcade__screen-actions";
    buttons.forEach(({ label, primary, onClick }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = primary ? "btn btn--primary" : "btn btn--secondary";
      b.textContent = label;
      b.addEventListener("click", onClick);
      row.append(b);
    });
    overlay.panel.append(row);

    overlay.root.hidden = false;
    const first = row.querySelector("button");
    if (first) first.focus();
  }

  function hideScreen() {
    overlay.root.hidden = true;
    canvas.focus();
  }

  function showTitle() {
    state = "title";
    showScreen({
      title: "HANGOUT QUEST",
      lines: [
        "Reach the banner at the end of each level.",
        "Every level the samurai get faster and take one more hit.",
        "← → move · Space jump · J slash · P pause",
      ],
      buttons: [{ label: "▶ Start", primary: true, onClick: startGame }],
    });
  }

  function startGame() {
    newGame();
    readPalette();
    updateHud();
    hideScreen();
    acc = 0;
    state = "play";
  }

  function pauseGame() {
    if (state !== "play") return;
    state = "pause";
    showScreen({
      title: "PAUSED",
      buttons: [
        { label: "Resume", primary: true, onClick: resumeGame },
        { label: "Restart", onClick: startGame },
      ],
    });
  }

  function resumeGame() {
    hideScreen();
    acc = 0;
    state = "play";
  }

  function rememberBest() {
    if (score <= best) return false;
    best = score;
    saveBest(score);
    return true;
  }

  function levelClear() {
    const bonus = Math.ceil(timeLeft) * 10 + hero.hearts * 500;
    score += bonus;
    state = "clear";
    sound("clear");
    const isBest = rememberBest(); // saved now, so quitting later doesn't lose it
    updateHud();

    const next = level.number + 1;
    const nextDiff = difficulty(next);
    const nextName = LEVELS[(next - 1) % LEVELS.length].name;
    const hearts = Math.min(3, hero.hearts + 1);

    showScreen({
      title: `LEVEL ${level.number} CLEAR!`,
      lines: [
        `Bonus +${fmt.format(bonus)} · Score ${fmt.format(score)}${isBest ? " · ★ New best!" : ""}`,
        `Next: Level ${next}, ${nextName}`,
        `Samurai take ${nextDiff.hp} hits and move faster. You get +1 ♥.`,
      ],
      buttons: [
        { label: "Next level ▶", primary: true, onClick: () => startLevel(next, hearts) },
        { label: "Quit", onClick: showTitle },
      ],
    });
  }

  function startLevel(n, hearts) {
    loadLevel(n, hearts);
    readPalette();
    updateHud();
    hideScreen();
    acc = 0;
    state = "play";
  }

  function gameOver() {
    if (state !== "play") return;
    state = "over";
    sound("over");
    const isBest = rememberBest();
    updateHud();

    showScreen({
      title: "GAME OVER",
      lines: [
        `Reached level ${level.number} · Score ${fmt.format(score)}`,
        isBest ? "★ New best! It's on your profile now." : `Your best: ${fmt.format(best)}`,
      ],
      buttons: [
        { label: "Play again", primary: true, onClick: startGame },
        { label: "Close", onClick: () => dialog.close() },
      ],
    });
  }

  /* ---------- Controls ---------- */

  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    Space: "jump", ArrowUp: "jump", KeyW: "jump", KeyK: "jump",
    KeyJ: "slash", KeyX: "slash",
  };

  // What's held down right now. Tracked all the time, even on menu screens,
  // so a key you're still holding when a level starts works straight away.
  const heldKeys = new Set();                                  // keyboard
  const padHeld = { left: false, right: false, jump: false };  // touch buttons

  function isHeld(action) {
    if (padHeld[action]) return true;
    for (const code of heldKeys) if (KEYMAP[code] === action) return true;
    return false;
  }

  function syncKeys() {
    keys.left = isHeld("left");
    keys.right = isHeld("right");
    keys.jump = isHeld("jump");
  }

  // Touch buttons
  function press(action, down) {
    if (action in padHeld) padHeld[action] = down;
    syncKeys();
    if (down && state === "play") {
      if (action === "jump") keys.jumpPressed = true;
      if (action === "slash") keys.slashPressed = true;
    }
  }

  function onKey(event) {
    if (!dialog.open) return;
    const down = event.type === "keydown";

    if (event.code === "KeyP" && down) {
      if (state === "play") pauseGame();
      else if (state === "pause") resumeGame();
      return;
    }

    const action = KEYMAP[event.code];
    if (!action) return;

    if (down) heldKeys.add(event.code);
    else heldKeys.delete(event.code);
    syncKeys();

    if (state !== "play") return; // on menus, Space/Enter still press the buttons
    event.preventDefault();       // stop arrows and space from scrolling the page

    // A tap counts once: holding a key down doesn't repeat jumps or slashes
    if (down && !event.repeat) {
      if (action === "jump") keys.jumpPressed = true;
      if (action === "slash") keys.slashPressed = true;
    }
  }

  function releaseAll() {
    heldKeys.clear();
    padHeld.left = padHeld.right = padHeld.jump = false;
    syncKeys();
    keys.jumpPressed = keys.slashPressed = false;
  }

  /* ---------- Building the popup ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function buildDialog() {
    dialog = el("dialog", "arcade");
    dialog.setAttribute("aria-labelledby", "arcade-title");

    const bar = el("div", "arcade__bar");
    const title = el("h2", "arcade__title", "Hangout Quest");
    title.id = "arcade-title";
    const keysHint = el("span", "arcade__keys", "← → move · Space jump · J slash · P pause");
    const close = el("button", "arcade__close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "Close game");
    close.addEventListener("click", () => dialog.close());
    bar.append(title, keysHint, close);

    const screen = el("div", "arcade__screen");
    canvas = el("canvas", "arcade__canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.tabIndex = -1;
    canvas.setAttribute("aria-label", "Game screen");
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const hudRoot = el("div", "arcade__hud");
    hud = {
      level: el("span", "arcade__hud-level"),
      score: el("span", "arcade__hud-score"),
      coins: el("span"),
      hearts: el("span", "arcade__hud-hearts"),
      time: el("span"),
      best: el("span"),
    };
    hudRoot.append(hud.level, hud.score, hud.coins, hud.hearts, hud.time, hud.best);

    const overlayRoot = el("div", "arcade__overlay");
    const panel = el("div", "arcade__panel");
    panel.setAttribute("role", "status");
    overlayRoot.append(panel);
    overlay = { root: overlayRoot, panel };

    screen.append(canvas, hudRoot, overlayRoot);

    // Touch buttons (only shown on touch screens, see game.css)
    const pad = el("div", "arcade__pad");
    [["◀", "left"], ["▶", "right"], ["JUMP", "jump"], ["SLASH", "slash"]].forEach(([label, action]) => {
      const b = el("button", `arcade__pad-btn arcade__pad-btn--${action}`, label);
      b.type = "button";
      const down = (e) => { e.preventDefault(); press(action, true); };
      const up = (e) => { e.preventDefault(); press(action, false); };
      b.addEventListener("pointerdown", down);
      b.addEventListener("pointerup", up);
      b.addEventListener("pointerleave", up);
      b.addEventListener("pointercancel", up);
      pad.append(b);
    });

    dialog.append(bar, screen, pad);
    document.body.append(dialog);

    // Esc pauses first; Esc again (or ✕) closes
    dialog.addEventListener("cancel", (event) => {
      if (state === "play") {
        event.preventDefault();
        pauseGame();
      }
    });

    dialog.addEventListener("close", () => {
      if (state === "play") state = "pause";
      releaseAll();
      cancelAnimationFrame(raf);
      if (playButton) playButton.focus();
    });

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", () => { releaseAll(); if (dialog.open) pauseGame(); });

    // Day/night switch while the game is open
    new MutationObserver(readPalette).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readPalette);
  }

  /* ---------- Loading the sprite sheets ---------- */

  let loading = null;

  function loadSheets() {
    if (!loading) {
      loading = Promise.all(Object.values(SHEETS).map((sheet) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { sheet.img = img; resolve(); };
        img.onerror = () => reject(new Error(`Missing sprite: ${sheet.file}`));
        img.src = new URL(sheet.file, SPRITE_DIR).href;
      })));
    }
    return loading;
  }

  /* ---------- Opening the game ---------- */

  function openGame() {
    if (!dialog) buildDialog();
    dialog.showModal();
    readPalette();
    best = readBest();
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);

    // Closed in the middle of a run? Come back to the pause screen
    if (state === "pause") {
      state = "play";
      pauseGame();
      return;
    }

    state = "loading";
    showScreen({ title: "LOADING…" });
    loadSheets()
      .then(() => {
        if (!level) newGame();
        updateHud();
        showTitle();
      })
      .catch((error) => {
        showScreen({
          title: "Can't load the game",
          lines: [error.message, "Check the files in img/fighters/."],
          buttons: [{ label: "Close", onClick: () => dialog.close() }],
        });
      });
  }

  function addPlayButton() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;
    playButton = el("button", "arcade-toggle", "▶ Play");
    playButton.type = "button";
    playButton.title = "Play Hangout Quest";
    playButton.addEventListener("click", openGame);
    nav.prepend(playButton);
  }

  addPlayButton();
  window.openGame = openGame;
})();