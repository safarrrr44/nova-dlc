/* =========================================================
   NOVA ARENA — KillAura sandbox
   Своя мини-игра на canvas: dummy в центре, кристаллы вок-
   руг в reach-кольце, KillAura бьёт по APS, ты добиваешь
   кликами, античит-метр копит флаги за rage-настройки.
   Сбоизолировано в IIFE — не трогает глобальный scope.
   ========================================================= */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const BLOCK = 46;            // пикселей на 1 блок (reach-кольцо)
  const ROUND_TIME = 30;       // длительность раунда
  const MANUAL_CPS_MS = 110;   // лимит ручных кликов
  const BEST_KEY = "novaArenaBest";
  const TARGETS_N = 4;
  const MAX_HP = 200;

  // --- DOM ---
  const canvas = $("#arCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const stage = $(".arena-stage");
  const elScore = $("#arScore");
  const elCombo = $("#arCombo");
  const elKills = $("#arKills");
  const elTime = $("#arTime");
  const elBest = $("#arBest");
  const riskBar = $("#arRiskBar");
  const flagLine = $("#arFlagLine");
  const endOv = $("#arEnd");
  const endScore = $("#arEndScore");
  const endKills = $("#arEndKills");
  const endCombo = $("#arEndCombo");
  const endNew = $("#arEndNew");

  // --- настройки модуля ---
  const cfg = { ka: true, reach: 3.2, aps: 11, hum: 70, snap: "smooth" };

  // --- состояние ---
  let state = "idle"; // idle | run | end
  let tLeft = ROUND_TIME;
  let score = 0, kills = 0, combo = 0, bestCombo = 0;
  let hp = MAX_HP;

  const dummy = { x: 0, y: 0 };
  let ringR = cfg.reach * BLOCK;

  const targets = [];
  const parts = [];    // партиклы
  const floats = [];   // всплывающий текст

  let kaAim = null;        // куда смотрит KillAura {x, y}
  let kaTimer = 0;         // аккумулятор APS
  const hitTimes = [];     // лайв-APS (последняя секунда)
  const clickTimes = [];   // для CPS-флага
  let lastClick = 0;

  let risk = 0;            // метр античита 0..100
  let flagCd = 0;          // кулдаун тостов флагов
  let shakeT = 0;
  let flashT = 0;
  let dummyFlash = 0;

  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
  elBest.textContent = best.toLocaleString("ru-RU");

  // --- утилиты ---
  const rnd = (a, b) => a + Math.random() * (b - a);
  const vl = () => "#" + (1000 + Math.floor(Math.random() * 9000));
  const nowMs = () => performance.now();

  /* =============== звук =============== */
  let AC = null;
  function audio() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { AC = null; }
    }
    return AC;
  }
  function sfx(kind) {
    try {
      const a = audio();
      if (!a) return;
      const t0 = a.currentTime;
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.type = "square";
      let dur = 0.08;
      if (kind === "hit")      { o.frequency.setValueAtTime(620 + Math.random() * 160, t0); g.gain.setValueAtTime(0.035, t0); }
      else if (kind === "crit")  { o.type = "sine";   o.frequency.setValueAtTime(800, t0);  o.frequency.exponentialRampToValueAtTime(1450, t0 + 0.12); dur = 0.14; g.gain.setValueAtTime(0.05, t0); }
      else if (kind === "kill")  { o.type = "triangle"; o.frequency.setValueAtTime(320, t0); o.frequency.exponentialRampToValueAtTime(680, t0 + 0.16); dur = 0.18; g.gain.setValueAtTime(0.05, t0); }
      else if (kind === "miss")  { o.frequency.setValueAtTime(180, t0); dur = 0.09; g.gain.setValueAtTime(0.03, t0); }
      else if (kind === "ban")   { o.type = "sawtooth"; o.frequency.setValueAtTime(220, t0); o.frequency.exponentialRampToValueAtTime(65, t0 + 0.45); dur = 0.5; g.gain.setValueAtTime(0.07, t0); }
      else /* start */         { o.type = "sine"; o.frequency.setValueAtTime(440, t0); o.frequency.exponentialRampToValueAtTime(880, t0 + 0.18); dur = 0.2; g.gain.setValueAtTime(0.045, t0); }
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (_) { /* без звука — не страшно */ }
  }

  /* =============== лэйаут =============== */
  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nx = w * 0.5, ny = h * 0.52;
    const ddx = nx - dummy.x, ddy = ny - dummy.y;
    dummy.x = nx;
    dummy.y = ny;
    ringR = cfg.reach * BLOCK;
    // перенос кристаллов вместе с центром (ресайз)
    for (const c of targets) {
      c.x += ddx; c.y += ddy;
      if (c.tx != null) { c.tx += ddx; c.ty += ddy; }
    }
  }

  /* =============== кристаллы =============== */
  function ringPoint(minK, maxK, flat) {
    const ang = Math.random() * Math.PI * 2;
    const d = ringR * rnd(minK, maxK);
    return {
      x: dummy.x + Math.cos(ang) * d,
      y: dummy.y + Math.sin(ang) * d * flat - 14,
    };
  }
  function spawnTarget(c) {
    const p = ringPoint(0.3, 0.9, 0.82);
    c.x = p.x; c.y = p.y;
    c.tx = null; c.ty = null;
    c.wait = rnd(0, 1.2);
    c.rot = Math.random() * 6.28;
    c.rotV = rnd(1.6, 3.2) * (Math.random() < 0.5 ? -1 : 1);
    c.r = 15;
    c.flash = 0;
  }
  function stepTargets(dt) {
    for (const c of targets) {
      if (c.tx == null || Math.hypot(c.tx - c.x, c.ty - c.y) < 6) {
        if ((c.wait -= dt) <= 0) {
          const p = ringPoint(0.25, 0.9, 0.82);
          c.tx = p.x; c.ty = p.y;
          c.wait = rnd(0.9, 2.1);
        }
      } else {
        const dx = c.tx - c.x, dy = c.ty - c.y;
        const L = Math.hypot(dx, dy) || 1;
        const sp = 34;
        c.x += dx / L * sp * dt;
        c.y += dy / L * sp * dt;
      }
      c.rot += c.rotV * dt;
      if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 4);
    }
  }

  /* =============== хиты =============== */
  function popFloat(x, y, text, color, size) {
    floats.push({ x, y, text, color, size: size || 14, life: 1 });
    if (floats.length > 24) floats.shift();
  }
  function burst(x, y, n, color, big) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x, y,
        vx: rnd(-90, 90) * (big ? 1.5 : 1),
        vy: rnd(-150, -30),
        life: rnd(0.35, 0.75),
        size: rnd(2, 5) * (big ? 1.4 : 1),
        color,
      });
    }
  }
  function comboMult() {
    return 1 + Math.min(combo, 30) * 0.05; // до ×2.5
  }
  function applyHit(c, kind) {
    const crit = Math.random() < 0.2;
    let dmg = kind === "ka" ? rnd(5, 8) : rnd(8, 12);
    if (crit) dmg *= 2;
    dmg = Math.round(dmg);
    combo++;
    if (combo > bestCombo) bestCombo = combo;
    score += dmg * comboMult();
    hp -= dmg;
    c.flash = 1;
    popFloat(c.x, c.y - 18, crit ? "★ " + dmg : String(dmg), crit ? "#ffd166" : "#7cf5c0", crit ? 17 : 14);
    burst(c.x, c.y, crit ? 11 : 6, crit ? "#ffd166" : "#7cf5c0", crit);
    sfx(crit ? "crit" : "hit");
    if (hp <= 0) killDummy();
  }
  function killDummy() {
    kills++;
    score += 120;
    combo += 0; // комбо не рвётся — dummy возрождается мгновенно
    hp = MAX_HP;
    dummyFlash = 1;
    shakeT = Math.max(shakeT, 0.18);
    burst(dummy.x, dummy.y - 40, 24, "#ffd166", true);
    popFloat(dummy.x, dummy.y - 120, "+1 KILL", "#22e584", 17);
    sfx("kill");
  }
  function missFloat(x, y, text) {
    popFloat(x, y, text, "#ff8290", 13);
  }

  /* --- KillAura: авто-хиты по ближайшему кристаллу в кольце --- */
  function kaStep(dt) {
    if (!cfg.ka || state !== "run") return;
    kaTimer -= dt;
    // длинный кадр — добираем пропущенные очереди, но не спамим
    let guard = 0;
    while (kaTimer <= 0 && guard < 3) {
      kaTimer += 1 / cfg.aps;
      guard++;
      let c = null, bd = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.x - dummy.x, t.y - dummy.y);
        if (d <= ringR && d < bd) { bd = d; c = t; }
      }
      if (!c) break;
      kaAim = { x: c.x, y: c.y };
      // точность растёт с humanize: ноль humanize — столб-ротатор с промахами
      const acc = 0.55 + (cfg.hum / 100) * 0.42 + (cfg.snap === "fast" ? 0.03 : 0);
      hitTimes.push(nowMs());
      if (Math.random() < acc) applyHit(c, "ka");
      else missFloat(c.x, c.y, "whiff");
    }
  }

  /* --- ручные клики --- */
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (state !== "run") {
      popFloat(mx, my, state === "idle" ? "старт раунда ▶" : "раунд кончился", "#9be8c7", 12);
      return;
    }
    const t = nowMs();
    if (t - lastClick < MANUAL_CPS_MS) return;
    lastClick = t;
    clickTimes.push(t);
    while (clickTimes.length && t - clickTimes[0] > 1000) clickTimes.shift();

    let target = null, bd = Infinity;
    for (const c of targets) {
      const d = Math.hypot(c.x - mx, c.y - my);
      if (d <= c.r + 12 && d < bd) { bd = d; target = c; }
    }
    if (target) {
      hitTimes.push(nowMs());
      applyHit(target, "manual");
      return;
    }
    // мимо цели
    const dd = Math.hypot(dummy.x - mx, dummy.y - my);
    missFloat(mx, my, dd <= ringR ? "MISS" : "ДАЛЕКО ⚠");
    combo = 0;
    sfx("miss");
  });

  /* =============== античит-движок =============== */
  function liveHits() {
    const t = nowMs();
    while (hitTimes.length && t - hitTimes[0] > 1000) hitTimes.shift();
    return hitTimes.length;
  }
  function flagEngine(dt) {
    if (state !== "run") return;
    const parts = {
      reach: cfg.reach > 3.55 ? (cfg.reach - 3.55) * 2.6 : 0,
      aps:   cfg.aps > 12 ? (cfg.aps - 12) * 1.35 : 0,
      hum:   cfg.hum < 30 ? (30 - cfg.hum) * 0.09 : 0,
      snap:  cfg.snap === "fast" ? 0.9 : 0,
      cps:   clickTimes.length > 9 ? 6 : 0,
    };
    const sum = parts.reach + parts.aps + parts.hum + parts.snap + parts.cps;
    const why = Object.keys(parts).sort((a, b) => parts[b] - parts[a])[0];
    risk = Math.min(100, risk + sum * dt * 0.8);

    flagCd -= dt;
    if (sum > 0.35 && flagCd <= 0) {
      flagCd = 2.2;
      flagToast(why);
    }
    if (risk >= 100) banWave();
  }
  function flagToast(why) {
    let msg;
    if (why === "reach") msg = "Grim: reach " + cfg.reach.toFixed(2) + " > 3.05 · VL " + vl();
    else if (why === "aps") msg = "Grim: " + Math.round(liveHits()) + " hits/сек — ну ты и жук";
    else if (why === "hum") msg = "Grim: ротация как у столба · VL " + vl();
    else if (why === "snap") msg = "Matrix: snap-rot засечён · VL " + vl();
    else msg = "Grim: CPS " + clickTimes.length + " — мышь живая вообще?";
    setFlag(msg);
  }
  function setFlag(msg, mode) {
    flagLine.textContent = msg;
    flagLine.className = "ap-flagline" + (mode ? " " + mode : risk > 30 && risk < 85 ? " warn" : risk >= 85 ? " ban" : "");
  }
  function banWave() {
    risk = 55;
    combo = 0;
    score *= 0.92;
    shakeT = 0.6;
    flashT = 0.45;
    const txt = ["BAN WAVE 💀", "💀 GRIM " + vl(), "UNBANNED SPEEDRUN? 💀"][Math.floor(Math.random() * 3)];
    popFloat(dummy.x, dummy.y - 150, txt, "#ff5d6c", 22);
    setFlag("BAN WAVE — штраф 8% счёта, комбо сгорело. Grim тебя «почувствовал»", "ban");
    sfx("ban");
  }

  /* =============== раунд =============== */
  let runStart = 0;
  function startRound() {
    state = "run";
    runStart = performance.now();
    score = 0; kills = 0; combo = 0; bestCombo = 0; hp = MAX_HP;
    risk = 0;
    kaTimer = 0;
    hitTimes.length = 0;
    clickTimes.length = 0;
    parts.length = 0;
    floats.length = 0;
    targets.length = 0;
    for (let i = 0; i < TARGETS_N; i++) { const c = {}; spawnTarget(c); targets.push(c); }
    endOv.classList.add("hidden");
    stage.classList.add("playing");
    flagLine.textContent = "Grim слушает тишину…";
    flagLine.className = "ap-flagline";
    sfx("start");
  }
  function endRound() {
    state = "end";
    stage.classList.remove("playing");
    const s = Math.round(score);
    endScore.textContent = s.toLocaleString("ru-RU");
    endKills.textContent = kills;
    endCombo.textContent = bestCombo;
    const isRec = s > best;
    if (isRec) {
      best = s;
      localStorage.setItem(BEST_KEY, String(s));
      elBest.textContent = best.toLocaleString("ru-RU");
    }
    endNew.classList.toggle("hidden", !isRec);
    endOv.classList.remove("hidden");
    setFlag("Раунд завершён. " + (isRec ? "Новый рекорд ✦" : "Grim вернулся досыпать"), isRec ? "warn" : "");
  }

  $("#arStartBtn").addEventListener("click", startRound);
  $("#arAgainBtn").addEventListener("click", startRound);

  /* =============== панель настроек =============== */
  const sw = $("#arKillSwitch");
  const swText = sw.querySelector(".ap-swtext");
  function toggleKA() {
    cfg.ka = !cfg.ka;
    sw.classList.toggle("on", cfg.ka);
    sw.setAttribute("aria-checked", String(cfg.ka));
    swText.textContent = cfg.ka ? "ON" : "OFF";
  }
  sw.addEventListener("click", toggleKA);
  sw.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleKA(); }
  });

  const rReach = $("#arReach"), rAps = $("#arAps"), rHum = $("#arHum");
  const vReach = $("#arReachVal"), vAps = $("#arApsVal"), vHum = $("#arHumVal");
  let oldReach = cfg.reach;
  function applyReach() {
    const k = cfg.reach / oldReach;
    // пропорционально растянуть позиции кристаллов под новое кольцо
    for (const c of targets) {
      c.x = dummy.x + (c.x - dummy.x) * k;
      c.y = dummy.y + (c.y - dummy.y) * k;
      if (c.tx != null) { c.tx = dummy.x + (c.tx - dummy.x) * k; c.ty = dummy.y + (c.ty - dummy.y) * k; }
    }
    oldReach = cfg.reach;
  }
  rReach.addEventListener("input", () => {
    cfg.reach = rReach.value / 10; // слайдер 30..60 → 3.0..6.0 блоков
    vReach.textContent = cfg.reach.toFixed(1);
    layout();
    applyReach();
  });
  rAps.addEventListener("input", () => {
    cfg.aps = parseInt(rAps.value, 10);
    vAps.textContent = cfg.aps;
  });
  rHum.addEventListener("input", () => {
    cfg.hum = parseInt(rHum.value, 10);
    vHum.textContent = cfg.hum;
  });
  $$("#arSnapSeg .ap-seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      cfg.snap = b.dataset.snap;
      $$("#arSnapSeg .ap-seg-btn").forEach((x) => x.classList.toggle("active", x === b));
    })
  );

  /* =============== отрисовка =============== */
  function drawGrid(w, h) {
    ctx.strokeStyle = "rgba(124,245,192,0.05)";
    ctx.lineWidth = 1;
    const step = BLOCK / 2;
    ctx.beginPath();
    for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }
  function drawDummy(t) {
    const x = dummy.x;
    const y2 = dummy.y - 112 + Math.sin(t * 2) * 2;
    const S = 5; // размер "текстурного пикселя"
    // тень
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, dummy.y + 58, 34, 8, 0, 0, 6.28);
    ctx.fill();
    // ноги
    ctx.fillStyle = "#17242a";
    ctx.fillRect(x - 16, y2 + 98, 14, 40);
    ctx.fillRect(x + 2, y2 + 98, 14, 40);
    // тело ( Nova hoodie )
    ctx.fillStyle = "#0f5a42";
    ctx.fillRect(x - 20, y2 + 40, 40, 58);
    ctx.fillStyle = "#0a3f30";
    ctx.fillRect(x - 20, y2 + 40, 40, 6);
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(x - 1, y2 + 46, 2, 52); // молния
    // руки
    ctx.fillStyle = "#0f5a42";
    ctx.fillRect(x - 28, y2 + 42, 8, 44);
    ctx.fillRect(x + 20, y2 + 42, 8, 44);
    ctx.fillStyle = "#d8a06a";
    ctx.fillRect(x - 28, y2 + 86, 8, 12);
    ctx.fillRect(x + 20, y2 + 86, 8, 12);
    // голова
    ctx.fillStyle = "#d8a06a";
    ctx.fillRect(x - 20, y2, 40, 40);
    ctx.fillStyle = "#3c2a1e";
    ctx.fillRect(x - 20, y2, 40, 10); // волосы
    ctx.fillStyle = "#1b2b4a";
    ctx.fillRect(x - 13, y2 + 22, 5, 5);
    ctx.fillRect(x + 8, y2 + 22, 5, 5);
    ctx.fillStyle = "#8a5c3a";
    ctx.fillRect(x - 6, y2 + 33, 12, 3);
    // вспышка при килле / HP бар
    if (dummyFlash > 0) {
      ctx.globalAlpha = dummyFlash * 0.75;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 28, y2, 56, 138);
      ctx.globalAlpha = 1;
    }
    const bw = 120, bh = 9;
    const bx = x - bw / 2, by = y2 - 22;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    const pct = Math.max(0, hp / MAX_HP);
    const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (pct > 0.5) { hg.addColorStop(0, "#22e584"); hg.addColorStop(1, "#7cf5c0"); }
    else if (pct > 0.25) { hg.addColorStop(0, "#ffd166"); hg.addColorStop(1, "#ff9f43"); }
    else { hg.addColorStop(0, "#ff5d6c"); hg.addColorStop(1, "#ff2e49"); }
    ctx.fillStyle = hg;
    ctx.fillRect(bx, by, bw * pct, bh);
  }
  function drawRing(t) {
    const active = state === "run";
    let col, al = active ? 0.75 : 0.3;
    if (risk < 35) col = "34,229,132";
    else if (risk < 70) col = "255,179,85";
    else col = "255,93,108";
    if (risk >= 85) al = active ? 0.55 + Math.sin(t * 10) * 0.25 : al;
    ctx.strokeStyle = "rgba(" + col + "," + al + ")";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.arc(dummy.x, dummy.y - 14, ringR, 0, 6.28);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawAimLine(t) {
    if (!kaAim || state !== "run") return;
    const j = (100 - cfg.hum) / 100 * 6;
    const ex = kaAim.x + Math.sin(t * 21) * j;
    const ey = kaAim.y + Math.cos(t * 17) * j;
    ctx.strokeStyle = "rgba(124,245,192,0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -t * 90;
    ctx.beginPath();
    ctx.moveTo(dummy.x, dummy.y - 40);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(124,245,192,0.9)";
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, 6.28);
    ctx.fill();
  }
  function drawCrystal(c, t) {
    const y = c.y + Math.sin(t * 2.2 + c.rot * 3) * 4;
    ctx.save();
    ctx.translate(c.x, y);
    ctx.rotate(c.rot);
    const g = ctx.createLinearGradient(-c.r, -c.r, c.r, c.r);
    g.addColorStop(0, "#22d3ee");
    g.addColorStop(1, "#22e584");
    ctx.shadowColor = "rgba(34,211,238,0.8)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -c.r);
    ctx.lineTo(c.r * 0.72, 0);
    ctx.lineTo(0, c.r);
    ctx.lineTo(-c.r * 0.72, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const k2 = c.r * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, -k2);
    ctx.lineTo(k2 * 0.72, 0);
    ctx.lineTo(0, k2);
    ctx.lineTo(-k2 * 0.72, 0);
    ctx.closePath();
    ctx.fill();
    if (c.flash > 0) {
      ctx.globalAlpha = c.flash;
      ctx.fillStyle = "#fff";
      const k3 = c.r * 1.25;
      ctx.beginPath();
      ctx.moveTo(0, -k3);
      ctx.lineTo(k3 * 0.72, 0);
      ctx.lineTo(0, k3);
      ctx.lineTo(-k3 * 0.72, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += 320 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  function drawFloats(dt) {
    ctx.textAlign = "center";
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y -= 26 * dt;
      f.life -= dt * 0.85;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      ctx.font = "700 " + f.size + "px " + (getComputedStyle(document.body).getPropertyValue("--font-display") || "monospace");
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }
  function draw(dt, t) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (shakeT > 0) {
      ctx.translate((Math.random() - 0.5) * 16 * shakeT, (Math.random() - 0.5) * 16 * shakeT);
    }
    drawGrid(w, h);
    drawRing(t);
    drawAimLine(t);
    drawDummy(t);
    for (const c of targets) drawCrystal(c, t);
    drawParts(dt);
    drawFloats(dt);
    if (flashT > 0) {
      ctx.fillStyle = "rgba(255,60,80," + (0.3 * flashT / 0.45) + ")";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  /* =============== HUD и цикл =============== */
  function hud() {
    elScore.textContent = Math.floor(score).toLocaleString("ru-RU");
    elCombo.textContent = combo;
    elKills.textContent = kills;
    elTime.textContent = Math.ceil(Math.max(0, tLeft)) + "с";
    riskBar.style.width = risk + "%";
    riskBar.style.background =
      risk < 35 ? "linear-gradient(90deg,#22e584,#22d3ee)"
      : risk < 70 ? "linear-gradient(90deg,#ffd166,#ff9f43)"
      : "linear-gradient(90deg,#ff5d6c,#ff2e49)";
  }

  let lastT = performance.now();
  function frame(nowTime) {
    const t = nowTime / 1000;
    const real = (nowTime - lastT) / 1000;
    lastT = nowTime;
    // редкие кадры (фоновая вкладка) не должны замораживать математику
    const dt = Math.min(0.35, real);

    stepTargets(dt);
    kaStep(dt);
    flagEngine(dt);
    if (state === "run") {
      tLeft = ROUND_TIME - (nowTime - runStart) / 1000; // честные часы раунда
      if (tLeft <= 0) { tLeft = 0; endRound(); }
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (flashT > 0) flashT = Math.max(0, flashT - dt);
    if (dummyFlash > 0) dummyFlash = Math.max(0, dummyFlash - dt * 2.2);

    draw(dt, t);
    hud();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", layout);
  layout();
  // кристаллы живут и в idle — так арена дышит до старта
  for (let i = 0; i < TARGETS_N; i++) { const c = {}; spawnTarget(c); targets.push(c); }
  requestAnimationFrame(frame);

  // страховка: если rAF заморожен (фоновая вкладка), тикаем медленным интервалом
  setInterval(() => {
    if (!document.hidden || performance.now() - lastT > 300) frame(performance.now());
  }, 250);

  // тихий дебаг-доступ (наши права в консоли браузера)
  window.__novaArena = () => ({ state, hp, kills, score, combo, risk, hits: liveHits(), real: (performance.now() - runStart) / 1000 });
})();
