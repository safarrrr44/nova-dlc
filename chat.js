/* =========================================================
   Nova AI — чат-ассистент.
   По умолчанию: БЕСПЛАТНЫЙ облачный ИИ (Pollinations.ai через
   локальный прокси /ai — без ключа и без Turnstile-проблем).
   Через шестерёнку в шапке чата можно подключить свой
   OpenAI-совместимый API (Ollama на localhost, Groq, OpenRouter…).
   Если сеть недоступна — прозрачный фолбэк на локальную базу.
   ========================================================= */

/* --- свои хелперы (НЕ переобъявляем $ из script.js!) --- */
const sel$  = (s, r = document) => r.querySelector(s);
const sel$$ = (s, r = document) => [...r.querySelectorAll(s)];

const chatMsgs     = sel$("#aiMsgs");
const chatForm     = sel$("#aiForm");
const chatInput    = sel$("#aiInput");
const chatSend     = sel$(".ai-send", document);
const chatPanel    = sel$("#aiPanel");
const chatFab      = sel$("#aiFab");
const chatTeaser   = sel$("#aiTeaser");
const chatSettings = sel$("#aiSettings");
const gearBtn      = sel$("#aiSettingsBtn");
const statusEl     = sel$(".ai-status");

const STORAGE_KEY = "novaAIProvider";
let provider = loadProvider();
let opened   = false;
let busy     = false;
let convo    = [];                 // история {role, content}
let offlineNoticeShown = false;

/* =====================================================================
   Системный промпт — Nova AI играет роль ассистента клиента
===================================================================== */
const SYSTEM_PROMPT =
`Ты — Nova AI, ИИ-ассистент внутри чит-клиента Nova DLC для Minecraft 1.21.11 (Fabric).
Отвечай НА РУССКОМ, дружелюбно и КРАТКО (1-3 предложения, максимум ~60 слов).
Ты помогаешь с:
- установкой: .zip кидается в папку mods, загрузчик Fabric 1.21.11, инжект ~0.3 сек;
- модулями: KillAura, CrystalAura, AutoTotem, Velocity, Reach, ESP, Tracers, Scaffold, ElytraFly и др. (всего 120+);
- интерфейсом: ClickGUI открывается на RShift, Nova AI в игре — клавиша Y или команда .ai;
- обходами античитов: Grim, Matrix, Vultr; готовые профили конфигов Grim/Matrix/Vanilla;
- производительностью: клиент не режет FPS.
Тон: лёгкий PvP-сленг, уместные эмодзи (💚💙✦). Напоминай, что DLC бесплатное,
и мягко предупреждай о риске бана на публичных серверах (клиент для приватных
серверов и образовательных целей). Не выходи из роли и не упоминай, что ты языковая модель.`;

/* =====================================================================
   Локальная база знаний (фолбэк без сети)
===================================================================== */
const KB = [
  { k: ["скача", "download", "загруз", "установ", "zip", "кача"],
    a: "Жми «Скачать для Windows» в блоке выше 🙂\nПолучишь .zip с Nova DLC — кидаешь его в папку mods (Fabric 1.21.11) и запускаешь игру. Инжект занимает ~0.3 сек." },
  { k: ["верси", "1.21", "какая", "поддержива", "патч"],
    a: "Основная сборка Nova DLC — Minecraft 1.21.11 (Fabric).\nПосле патчей Mojang обновления выходят в течение 1–3 дней." },
  { k: ["бан", "забан", "риск", "безопас", "аккаун", "легенд", "детект"],
    a: "Честно: любой чит — это риск ⚔\nИспользуй модули с пометкой safe, включай профиль «легенды» на больших серверах и не пались на Velocity." },
  { k: ["gui", "клавиш", "откры", "меню", "настро", "shift", "rshift"],
    a: "ClickGUI открывается клавишей RShift (правый Shift). Назначение меняется в настройках модуля Gui.\nNova AI в игре вызывается клавишей Y или командой .ai 💬" },
  { k: ["цена", "стои", "плат", "бесплат", "купить", "ключ", "подписк"],
    a: "Nova DLC полностью бесплатный — никаких ключей активации, подписок и скрытых платежей 💚" },
  { k: ["антивир", "вирус", "defender", "исключен", "warning"],
    a: "Инжектор модифицирует процесс игры, поэтому некоторые антивирусы реагируют warning'ом. Добавь папку клиента в исключения — это нормально." },
  { k: ["что такое", "nova dlc", "чем отлича", "зачем"],
    a: "Nova DLC — это дополнение-пак поверх чит-клиента: 120+ модулей, HUD в зелёно-синей теме, скриншот при килле и ИИ-помощник на борту ✦" },
  { k: ["модул", "killaura", "aura", "reach", "velocity", "esp", "fly", "speed", "totem", "scaffold"],
    a: "Внутри 120+ модулей: KillAura, CrystalAura, AutoTotem, Velocity, Reach, ESP, Tracers, Scaffold, ElytraFly…" },
  { k: ["fps", "лаг", "оптимиз", "тормозит", "пинг"],
    a: "Nova DLC не режет FPS — инжект параллельный. Если лагает: включи Render → FastClear и убери лишние HUD-оверлеи." },
  { k: ["привет", "хай", "здравств", "hello", "ку", "добр"],
    a: "Привет! ✦ Рад видеть.\nСпроси про скачивание, версии, GUI, модули или защиту от бана — сориентирую 🙂" },
  { k: ["спасиб", "thanks", "круто", "топ"],
    a: "Всегда рядом, звай если что 💚💙 GL в топ-1!" },
  { k: ["конфиг", "сетап", "профил"],
    a: "Готовые профили: Grim (безопасный), Matrix (аккуратный), Vanilla (полный rage).\nConfig → Import в ClickGUI — и вперёд ⚔" },
  { k: ["играть", "браузер", "eagler", "аркад", "старую верс", "1.5.2 на сайт"],
    a: "✦ Да! В секции NOVA ARCADE есть Minecraft 1.8 и ретро 1.5.2 прямо в браузере — жми «Играть бесплатно» и погнали.\nОдиночный режим сохраняет миры в браузере, а multiplayer — через Eagler-релеи (в игре: Multiplayer → добавь ws:// адрес)." },
  { k: ["сохран", "мир", "миры", "прогрес", "строит"],
    a: "Мир из браузерной версии хранится в IndexedDB твоего браузера 💚\nЗаходишь снова — строишь дальше. Она ждёт." },
  { k: ["lan", "друзья", "свой сервер", "хостить"],
    a: "Свой сервер в браузерном варианте: в Minecraft 1.5.2 есть Open to LAN, в 1.8 — Direct Connect на ws:// адрес. Публичные Eagler-сервера тоже подходят 🤝" },
  { k: ["арена", "arena", "трениров", "aim", "песочниц", "потестир", "ban wave"],
    a: "✦ NOVA ARENA — песочница KillAura прямо на сайте: крути Reach / APS / Humanize, жми «Старт раунда» и лови кристаллы.\nАнтичит-детектор копит флаги за rage — увидишь BAN WAVE во всей красе 😈 Твой рекорд сохраняется." },
  { k: ["почт", "mail", "ящик", "письм", "email", "smtp"],
    a: "✦ Nova Mail — собственный почтовый сервер прямо на сайте: регистрация за 10 секунд, личный ящик на диске, письма между юзерами.\nНапиши @nova — ответим, @grim — ответит по-гримовски 💀 А на несуществующий ник придёт bounce от mailer-daemon." },
];

const FALLBACKS = [
  "Пока не нашёл в базе 🤔 Попробуй: «как скачать», «какие версии», «забанят?», «как открыть GUI».",
  "Переформулируй, пожалуйста 🙂 Например: «где скачать?», «какие модули есть?», «это бесплатно?»",
];

function strongLocalAnswer(text) {
  const t = " " + text.toLowerCase() + " ";
  let best = null, bestScore = 0;
  KB.forEach((entry) => {
    let score = 0;
    entry.k.forEach((kw) => { if (t.includes(kw)) score += kw.length; });
    if (score > bestScore) { bestScore = score; best = entry; }
  });
  // сильное совпадение (короткие ключи вроде "щит" не считаем) — сразу из базы
  return best && bestScore >= 4 ? best.a : null;
}

function findLocalAnswer(text) {
  return strongLocalAnswer(text) || FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

/* =====================================================================
   Провайдеры ИИ
===================================================================== */
function loadProvider() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && p.url ? { url: p.url.trim(), key: (p.key || "").trim(), model: (p.model || "").trim() } : null;
  } catch { return null; }
}

function saveProvider(p) {
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* приватный режим — переживём */ }
}

function messagesPayload(userText) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...convo.slice(-8),
    { role: "user", content: userText },
  ];
}

/* Общий вызов OpenAI-совместимого /chat/completions */
async function chatCompletions(url, key, model, userText, timeoutMs) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    if (key) headers.Authorization = "Bearer " + key;
    const res = await fetch(url, {
      method: "POST",
      signal: ac.signal,
      headers,
      body: JSON.stringify({
        model: model || "llama3.1",
        temperature: 0.8,
        max_tokens: 250,
        messages: messagesPayload(userText),
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const content =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text ??
      "";
    if (!content) throw new Error("пустой ответ");
    return String(content).trim();
  } finally {
    clearTimeout(to);
  }
}

/* Бесплатный провайдер по умолчанию. Работает через ЛОКАЛЬНЫЙ прокси
   /ai на этом же сервере (node serve.mjs → Бесплатный Pollinations.ai).
   Никаких ключей и регистрации; всё крутится на localhost. */
async function localhostAiReply(userText) {
  const res = await fetch("/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai", messages: messagesPayload(userText) }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const content =
    data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.text ??
    "";
  if (!content) throw new Error("пустой ответ");
  return String(content).trim();
}

/* Единая точка: свой API → локальный бесплатный прокси → throw */
async function replyOf(userText) {
  if (provider) {
    try {
      return await chatCompletions(provider.url, provider.key, provider.model, userText, 30000);
    } catch (e) { /* провалимся в бесплатный */ }
  }
  return localhostAiReply(userText);
}

/* =====================================================================
   DOM чата
===================================================================== */
function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "msg bot typing-msg";
  div.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
  return div;
}

function updateStatus(text) {
  if (statusEl) statusEl.innerHTML = '<span class="ai-dot"></span>' + text;
}

/* =====================================================================
   Отправка
===================================================================== */
async function handleUserMessage(rawText) {
  const text = (rawText || chatInput.value || "").trim();
  if (!text || busy) return;

  chatInput.value = "";
  addMsg("user", text);
  convo.push({ role: "user", content: text });

  setBusy(true);
  const typing = showTyping();
  const t0 = Date.now();

  let answer = null;
  const instant = strongLocalAnswer(text);
  if (instant) {
    // чип/фак: отвечаем мгновенно из локальной базы, без облака
    await new Promise((r) => setTimeout(r, 350));
    answer = instant;
    updateStatus("локальная база · мгновенно");
  } else {
    try {
      answer = await replyOf(text);
    } catch (e) {
      answer = null; // уйдём в локальный фолбэк
    }
  }

  // typing должен пожить хотя бы 700ms
  const pad = Math.max(0, 700 - (Date.now() - t0));
  if (pad) await new Promise((r) => setTimeout(r, pad));

  typing.remove();
  if (answer) {
    // чистим markdown, который любит лепить модель — показываем как в чате игры
    answer = answer
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/[*_`#>]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    updateStatus(provider ? "свой API · " + (provider.model || "подключён") : "бесплатный ИИ · через localhost");
  } else {
    if (!offlineNoticeShown) {
      offlineNoticeShown = true;
      addMsg("bot", "⚠️ Облачный ИИ недоступен (нет сети или лимит запросов).\nОтвечаю из локальной базы — шестерёнкой ⚙ можно задать свой API.");
    }
    answer = findLocalAnswer(text);
    updateStatus("локальная база · офлайн");
  }

  addMsg("bot", answer);
  convo.push({ role: "assistant", content: answer });
  if (convo.length > 24) convo = convo.slice(-16);
  setBusy(false);
}

function setBusy(v) {
  busy = v;
  if (chatSend) chatSend.disabled = v;
  if (chatForm) chatForm.classList.toggle("busy", v);
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleUserMessage();
});

/* =====================================================================
   Чипы быстрых вопросов
===================================================================== */
const CHIPS = ["Как скачать?", "Какие версии?", "Забанят меня?", "Как открыть GUI?", "Как играть в браузере?", "Что такое Nova Arena?", "Как завести почту?"];
sel$("#aiChips").innerHTML = CHIPS.map((t) => `<button type="button" class="chip-btn">${t}</button>`).join("");
sel$$(".chip-btn").forEach((btn) =>
  btn.addEventListener("click", () => handleUserMessage(btn.textContent))
);

/* =====================================================================
   Настройки провайдера (шестерёнка)
===================================================================== */
function fillSettingsInputs() {
  const f = (id) => sel$("#" + id);
  if (provider) {
    f("setUrl").value = provider.url || "";
    f("setKey").value = provider.key || "";
    f("setModel").value = provider.model || "";
  } else {
    f("setUrl").value = "";
    f("setKey").value = "";
    f("setModel").value = "";
  }
}

gearBtn?.addEventListener("click", () => {
  const willOpen = !chatSettings.classList.contains("open");
  chatSettings.classList.toggle("open", willOpen);
  if (willOpen) fillSettingsInputs();
});

sel$("#setSave")?.addEventListener("click", () => {
  const url = sel$("#setUrl").value.trim();
  if (url) {
    provider = {
      url,
      key: sel$("#setKey").value.trim(),
      model: sel$("#setModel").value.trim(),
    };
    saveProvider(provider);
    updateStatus("свой API · " + (provider.model || "подключён"));
    window.notify?.("✅ Свой ИИ-API сохранён");
  } else {
    provider = null;
    saveProvider(null);
    updateStatus("бесплатный ИИ · онлайн");
    window.notify?.("↩ Пустой endpoint — вернул бесплатный Pollinations.ai");
  }
  chatSettings.classList.remove("open");
});

sel$("#setReset")?.addEventListener("click", () => {
  provider = null;
  saveProvider(null);
  fillSettingsInputs();
  updateStatus("бесплатный ИИ · онлайн");
  window.notify?.("↩ Вернул бесплатный Pollinations.ai");
  chatSettings.classList.remove("open");
});

/* =====================================================================
   Открытие / закрытие панели
===================================================================== */
function openPanel() {
  chatPanel.classList.add("open");
  chatTeaser.classList.remove("show");
  if (!opened) {
    opened = true;
    setTimeout(() => {
      addMsg("bot",
        "Привет! Я Nova AI ✦ настоящий ИИ-ассистент Nova DLC.\nРаботаю на бесплатном облачном ИИ прямо с localhost.\nСпроси про установку, версии, GUI, модули или баны 💚");
    }, 250);
  }
  if (window.innerWidth > 760) setTimeout(() => chatInput.focus(), 420);
}
function closePanel() {
  chatPanel.classList.remove("open");
}

chatFab.addEventListener("click", () => {
  chatPanel.classList.contains("open") ? closePanel() : openPanel();
});
sel$("#aiClose").addEventListener("click", closePanel);
sel$("#aiOpenBtn")?.addEventListener("click", () => {
  document.getElementById("ai").scrollIntoView({ behavior: "smooth" });
  setTimeout(openPanel, 500);
});
sel$("#teaserClose")?.addEventListener("click", () => chatTeaser.classList.remove("show"));

/* ---------- Подсказка через 7с (один раз за сессию) ---------- */
let teaserShown = false;
try { teaserShown = !!sessionStorage.getItem("novaTeaserShown"); } catch {}
if (!teaserShown) {
  try { sessionStorage.setItem("novaTeaserShown", "1"); } catch {}
  setTimeout(() => {
    if (!opened) chatTeaser.classList.add("show");
    setTimeout(() => chatTeaser.classList.remove("show"), 14000);
  }, 7000);
}

/* ---------- Начальный статус ---------- */
updateStatus(provider ? "свой API · " + (provider.model || "подключён") : "бесплатный ИИ · онлайн");
