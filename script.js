/* =========================================================
   LeakClient — site interactions
   ========================================================= */

/* ---------- Helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Preloader ---------- */
window.addEventListener("load", () => {
  setTimeout(() => $("#preloader").classList.add("done"), 500);
});
// Fallback if load hangs (fonts etc.)
setTimeout(() => $("#preloader")?.classList.add("done"), 2600);

/* ---------- Nav scroll state ---------- */
const nav = $("#nav");
const onScroll = () => {
  nav.classList.toggle("scrolled", window.scrollY > 30);
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- Mobile menu ---------- */
const burger = $("#burger");
const mobileMenu = $("#mobileMenu");

burger.addEventListener("click", () => {
  burger.classList.toggle("open");
  mobileMenu.classList.toggle("open");
});
$$("a", mobileMenu).forEach((a) =>
  a.addEventListener("click", () => {
    burger.classList.remove("open");
    mobileMenu.classList.remove("open");
  })
);

/* ---------- Scroll reveal ---------- */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        // stagger siblings inside the same parent
        const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
        const delay = Math.min(siblings.indexOf(el) * 80, 480);
        el.style.setProperty("--d", `${delay}ms`);
        el.classList.add("visible");
        revealObserver.unobserve(el);
      }
    });
  },
  { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
);

const observeReveals = () => $$(".reveal:not(.visible)").forEach((el) => revealObserver.observe(el));
observeReveals();

/* ---------- Hero title stagger & slight parallax ---------- */
$$(".hero-title .line").forEach((line, i) => {
  let inner = line.firstElementChild;
  if (!inner) {
    // строка состоит из голого текста — оборачиваем её в спан
    inner = document.createElement("span");
    inner.textContent = line.textContent.trim();
    line.textContent = "";
    line.appendChild(inner);
  }
  inner.classList.add("reveal-inner");
  inner.style.transitionDelay = `${i * 110}ms`;
});
requestAnimationFrame(() => $$(".hero-title .reveal-inner").forEach((el) => el.classList.add("visible")));

/* ---------- Typing effect ---------- */
const typedEl = $("#typed");
const words = ["KillAura()", "CrystalAura()", "AutoTotem()", "Velocity --obf 0.87", "GrimBypass()", "ElytraFly()"];
let wordIdx = 0, charIdx = 0, deleting = false;

(function type() {
  const word = words[wordIdx];
  typedEl.textContent = word.slice(0, charIdx);
  let delay = deleting ? 32 : 62;

  if (!deleting && charIdx === word.length) {
    delay = 1300;
    deleting = true;
  } else if (deleting && charIdx === 0) {
    deleting = false;
    wordIdx = (wordIdx + 1) % words.length;
    delay = 350;
  }

  charIdx += deleting ? -1 : 1;
  setTimeout(type, delay);
})();

/* ---------- Marquee ---------- */
const modulesMarquee = [
  "KillAura", "CrystalAura", "AutoTotem", "Velocity", "Reach", "ESP", "Tracers",
  "AutoClicker", "Scaffold", "ElytraFly", "Criticals", "NoFall", "WallHack",
  "AntiHunger", "AimBot", "InvManager", "Nuker", "Speed", "Fly", "FastPlace", "AntiKnockback",
  "EaglerX 1.8", "Retro 1.5.2", "Nova Arena", "KillAura Sim", "Nova Mail",
];
const renderTrack = (el) => {
  el.innerHTML = modulesMarquee
    .map((m) => `<span>${m}</span><i>◆</i>`)
    .join("");
};
renderTrack($("#track1"));
renderTrack($("#track2"));

/* ---------- Modules (clickable, like in-game GUI) ---------- */
const moduleList = [
  ["KillAura",     "rage"],
  ["CrystalAura",  "rage"],
  ["AutoTotem",    "mid"],
  ["Velocity",     "safe"],
  ["Reach",        "rage"],
  ["AutoClicker",  "mid"],
  ["ESP",          "safe"],
  ["Tracers",      "safe"],
  ["Scaffold",     "mid"],
  ["ElytraFly",    "safe"],
  ["AutoArmor",    "safe"],
  ["NoFall",       "safe"],
];

const riskLabel = { safe: "safe", mid: "caut", rage: "rage" };
const riskClass = { safe: "risk-safe", mid: "risk-mid", rage: "risk-rage" };

const grid = $("#modulesGrid");
grid.innerHTML = moduleList
  .map(([name, risk]) => `
    <div class="module-card" role="switch" aria-checked="false" tabindex="0">
      <span class="module-name">${name}</span>
      <span class="module-right">
        <span class="module-risk ${riskClass[risk]}">${riskLabel[risk]}</span>
        <span class="module-switch"></span>
      </span>
    </div>`)
  .join("");

const clickSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 300);
  } catch (e) { /* audio blocked — silence is fine */ }
};

$$(".module-card", grid).forEach((card) => {
  const toggle = () => {
    const on = card.classList.toggle("on");
    card.setAttribute("aria-checked", on);
    if (on) clickSound();
  };
  card.addEventListener("click", toggle);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
});

/* ---------- Counters ---------- */
const counterObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = +el.dataset.target;
      const dur = 1600;
      const start = performance.now();

      const tick = (now) => {
        const t = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      counterObserver.unobserve(el);
    });
  },
  { threshold: 0.6 }
);
$$(".counter").forEach((el) => counterObserver.observe(el));

/* ---------- Card spotlight + tilt ---------- */
$$(".tilt").forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    card.style.setProperty("--mx", `${x}px`);
    card.style.setProperty("--my", `${y}px`);
    const rx = ((y / r.height) - 0.5) * -6;
    const ry = ((x / r.width) - 0.5) * 6;
    card.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
});

/* ---------- FAQ accordion ---------- */
$$(".faq-item").forEach((item) => {
  const q = $(".faq-q", item);
  const a = $(".faq-a", item);
  q.addEventListener("click", () => {
    const isOpen = item.classList.contains("open");

    // close others
    $$(".faq-item.open").forEach((other) => {
      other.classList.remove("open");
      $(".faq-a", other).style.maxHeight = "0px";
    });

    if (!isOpen) {
      item.classList.add("open");
      a.style.maxHeight = a.scrollHeight + "px";
    }
  });
});

/* ---------- Toast ---------- */
let toastTimer;
function notify(text) {
  const toast = $("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
window.notify = notify;

/* ---------- Particles canvas ---------- */
const canvas = $("#particles");
const ctx = canvas.getContext("2d");
let pw, ph, particles = [];

const resize = () => {
  pw = canvas.width = canvas.offsetWidth;
  ph = canvas.height = canvas.offsetHeight;
};
resize();
window.addEventListener("resize", resize);

const COLORS = ["#7c5cff", "#22d3ee", "#ff4ecd", "#eaf0ff"];
const makeParticle = () => ({
  x: Math.random() * pw,
  y: Math.random() * ph,
  size: Math.random() * 2.4 + 1.2,
  speedY: -(Math.random() * 0.35 + 0.12),
  drift: (Math.random() - 0.5) * 0.25,
  phase: Math.random() * Math.PI * 2,
  color: COLORS[(Math.random() * COLORS.length) | 0],
  alpha: Math.random() * 0.5 + 0.25,
});
for (let i = 0; i < 70; i++) particles.push(makeParticle());

let t0 = 0;
(function draw(t) {
  ctx.clearRect(0, 0, pw, ph);
  particles.forEach((p) => {
    p.y += p.speedY;
    p.x += p.drift + Math.sin(t * 0.0008 + p.phase) * 0.18;

    if (p.y < -10) { Object.assign(p, makeParticle(), { y: ph + 10 }); }
    if (p.x < -10) p.x = pw + 10;
    if (p.x > pw + 10) p.x = -10;

    const twinkle = 0.65 + Math.sin(t * 0.002 + p.phase) * 0.35;
    ctx.globalAlpha = p.alpha * twinkle;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size); // squares = pixel vibes
  });
  ctx.globalAlpha = 1;
  requestAnimationFrame(draw);
})(0);

/* ---------- Smooth anchors (respect fixed nav) ---------- */
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id === "#") return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

/* =========================================================
   NOVA ARCADE — Minecraft в браузере (Eaglercraft)
   ========================================================= */
const ARCADE = {
  18: "/mc/18/index.html",
  152: "/mc/152/index.html",
};

const arcadeScreen = $("#arcadeScreen");
const arcadeStatus = $("#arcadeStatus");
const arcadePlayBtn = $("#arcadePlayBtn");
let arcadeVer = "18";
let arcadeRunning = false;

if (arcadeScreen) {
  const setArcadeStatus = (text, cls) => {
    arcadeStatus.textContent = "● " + text;
    arcadeStatus.className = "arcade-status" + (cls ? " " + cls : "");
  };

  // На каждую загрузку создаём iframe с нуля, а старый сносим:
  // не остаётся ни мусорных обработчиков, ни зависших диалогов клиента.
  const mountFrame = (ver) => {
    $("#arcadeFrame")?.remove();
    const f = document.createElement("iframe");
    f.id = "arcadeFrame";
    f.title = "Minecraft в браузере";
    f.allow = "fullscreen; pointer-lock";
    f.className = "arcade-frame";
    f.addEventListener("load", () => {
      setTimeout(() => {
        arcadeScreen.classList.add("started");
        setArcadeStatus("RUNNING · " + (ver === "18" ? "1.8" : "1.5.2"), "running");
      }, 800);
    });
    arcadeScreen.appendChild(f);
    setArcadeStatus("ЗАГРУЗКА", "loading");
    f.src = ARCADE[ver];
    arcadeRunning = true;
  };

  const stopArcade = () => {
    arcadeRunning = false;
    arcadeScreen.classList.remove("started");
    $("#arcadeFrame")?.remove(); // сносим клиент целиком
    setArcadeStatus("ОЖИДАНИЕ");
    document.exitFullscreen?.().catch?.(() => {});
  };

  arcadePlayBtn.addEventListener("click", () => {
    if (arcadeRunning) return;
    mountFrame(arcadeVer);
  });

  $("#arcadeStopBtn")?.addEventListener("click", stopArcade);

  $$(".arcade-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.ver === arcadeVer) return;
      arcadeVer = tab.dataset.ver;
      $$(".arcade-tab").forEach((t) => t.classList.toggle("active", t.dataset.ver === arcadeVer));
      if (arcadeRunning) {
        arcadeScreen.classList.remove("started");
        mountFrame(arcadeVer); // сам убивает старую рамку
      }
    });
  });

  $("#arcadeFsBtn")?.addEventListener("click", () => {
    const card = $(".arcade-card");
    if (document.fullscreenElement) document.exitFullscreen();
    else (card.requestFullscreen?.() ?? Promise.resolve())?.catch?.(() => {});
  });
}
