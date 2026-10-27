/* =========================================================
   NOVA MAIL — клиент локального почтового сервера.
   Регистрация/вход, входящие, чтение, композ, удаление.
   Токен в localStorage ("novaMailToken"). Всё в IIFE.
   ========================================================= */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const TOKEN_KEY = "novaMailToken";
  const USER_KEY = "novaMailUser";

  const authBox = $("#mailAuth");
  const clientBox = $("#mailClient");
  if (!authBox || !clientBox) return;

  const elUser = $("#mailUser");
  const elPass = $("#mailPass");
  const elRegRow = $("#mailRegRow");
  const elEmail = $("#mailEmail");
  const elCode = $("#mailCode");
  const elCodeBtn = $("#mailCodeBtn");
  const elMsg = $("#mailMsg");
  const elGo = $("#mailGoBtn");
  const elWho = $("#mailWho");
  const elList = $("#mailList");
  const elUnread = $("#mailUnread");
  const elView = $("#mailView");

  let mode = "login"; // login | reg
  let token = localStorage.getItem(TOKEN_KEY) || "";
  let myName = localStorage.getItem(USER_KEY) || "";
  let letters = [];
  let activeId = null;
  let usersDir = ["nova", "grim", "mailer-daemon"];

  const api = async (path, opts = {}) => {
    const r = await fetch("/api/mail" + path, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-nova-token": token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let j = {};
    try { j = await r.json(); } catch (_) { /* no body */ }
    return { status: r.status, ...j };
  };

  const setMsg = (text, cls) => {
    elMsg.textContent = text || "";
    elMsg.className = "ma-msg" + (cls ? " " + cls : "");
  };

  /* ---------- показ экранов ---------- */
  function showAuth(note, cls) {
    authBox.classList.remove("hidden");
    clientBox.classList.add("hidden");
    token = "";
    myName = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setMsg(note || "Всё живёт на твоём localhost — никакого облака", cls);
  }
  function showClient() {
    authBox.classList.add("hidden");
    clientBox.classList.remove("hidden");
    elWho.textContent = "@" + myName;
    refresh().catch(() => logout(true));
  }

  /* ---------- авторизация ---------- */
  $$(".ma-tab").forEach((t) =>
    t.addEventListener("click", () => {
      mode = t.dataset.auth;
      $$(".ma-tab").forEach((x) => x.classList.toggle("active", x === t));
      elGo.textContent = mode === "login" ? "Войти в ящик" : "Создать ящик";
      elRegRow?.classList.toggle("hidden", mode === "login");
      setMsg(mode === "login" ? "Всё живёт на твоём localhost — никакого облака" : "Придумай ник → получи код на email → подтверди");
    })
  );

  /* ---------- код на email ---------- */
  const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e);
  elCodeBtn?.addEventListener("click", async () => {
    const email = (elEmail.value || "").trim();
    if (!emailOk(email)) return setMsg("Сначала нормальный email: name@domen.tld", "err");
    elCodeBtn.disabled = true;
    setMsg("Отправляю код…");
    try {
      const r = await api("/email-code", { body: { email } });
      if (r.sent) {
        setMsg("Код ушёл на " + email + " — глянь входящие (и спам), живёт 10 минут", "ok");
      } else if (r.dev) {
        elCode.value = r.code;
        setMsg("Локальный режим без провайдера: код " + r.code + " — уже в поле «6 цифр». Настоящие письма включит ключ в mail-data/provider.json", "ok");
      } else {
        setMsg(r.error || "Не получилось", "err");
      }
    } catch (_) {
      setMsg("Сервер не отвечает — он вообще запущен? (node serve.mjs)", "err");
    } finally {
      let left = 60;
      const btnText = "Получить код";
      const tick = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearInterval(tick);
          elCodeBtn.disabled = false;
          elCodeBtn.textContent = btnText;
        } else {
          elCodeBtn.textContent = left + " с";
        }
      }, 1000);
    }
  });

  $("#mailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = elUser.value.trim();
    const pass = elPass.value;
    if (!user || !pass) return setMsg("Заполни ник и пароль", "err");
    if (mode === "reg" && !emailOk((elEmail.value || "").trim()))
      return setMsg("Укажи настоящий email — на него идёт код", "err");
    if (mode === "reg" && !(elCode.value || "").trim())
      return setMsg("Получи код кнопкой «Получить код» и вставь сюда", "err");
    elGo.disabled = true;
    setMsg(mode === "login" ? "Подключаюсь…" : "Проверяю код и создаю ящик…");
    try {
      const body = mode === "login"
        ? { user, pass }
        : { user, pass, email: elEmail.value.trim(), code: elCode.value.trim() };
      const r = await api(mode === "login" ? "/login" : "/register", { body });
      if (r.ok && r.token) {
        token = r.token;
        myName = r.user;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, myName);
        elPass.value = "";
        showClient();
        window.notify?.(mode === "login" ? "📬 С возвращением, @" + myName : "✉ Ящик @" + myName + " создан — у тебя письма!");
      } else {
        setMsg(r.error || "Не получилось", "err");
      }
    } catch (_) {
      setMsg("Сервер не отвечает — он вообще запущен? (node serve.mjs)", "err");
    } finally {
      elGo.disabled = false;
    }
  });

  function logout(silent) {
    api("/logout", { body: {} }).catch(() => {});
    if (!silent) window.notify?.("👋 Ящик отложен до следующего раза");
    showAuth();
  }
  $("#mailLogout").addEventListener("click", () => logout(false));

  /* ---------- входящие ---------- */
  function timeAgo(ts) {
    const d = Math.max(0, Date.now() - ts);
    const m = Math.floor(d / 60000);
    if (m < 1) return "только что";
    if (m < 60) return m + " мин";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " ч";
    const dd = Math.floor(h / 24);
    if (dd < 7) return dd + " д";
    const t = new Date(ts);
    return ("0" + t.getDate()).slice(-2) + "." + ("0" + (t.getMonth() + 1)).slice(-2);
  }
  function emptyListViewer(text) {
    elView.innerHTML = "";
    const d = document.createElement("div");
    d.className = "mail-empty";
    d.textContent = text;
    elView.appendChild(d);
  }

  async function refresh() {
    const r = await api("/inbox");
    if (r.status === 401) { showAuth(); return; }
    if (!r.ok) return;
    letters = r.letters || [];
    myName = r.user || myName;
    elWho.textContent = "@" + myName;
    elUnread.textContent = String(r.unread || 0);
    renderList();
  }

  function renderList() {
    elList.innerHTML = "";
    if (!letters.length) {
      const d = document.createElement("div");
      d.style.cssText = "padding:18px 16px;color:var(--muted);font-size:12.5px;font-weight:600";
      d.textContent = "Писем нет. Напиши @nova — он отвечает первым ✦";
      elList.appendChild(d);
      return;
    }
    for (const l of letters) {
      const it = document.createElement("div");
      it.className = "mail-item" + (l.read ? "" : " unread") + (l.id === activeId ? " active" : "");
      const from = document.createElement("div");
      from.className = "mi-from";
      const dot = document.createElement("span");
      dot.className = "mi-dot";
      const nm = document.createElement("span");
      nm.textContent = l.name ? l.name + " · @" + l.from : "@" + l.from;
      const tm = document.createElement("span");
      tm.className = "mi-time";
      tm.textContent = timeAgo(l.ts);
      from.append(dot, nm, tm);
      const subj = document.createElement("div");
      subj.className = "mi-subj";
      subj.textContent = l.subject;
      it.append(from, subj);
      it.addEventListener("click", () => openLetter(l.id));
      elList.appendChild(it);
    }
  }

  /* ---------- чтение письма ---------- */
  async function openLetter(id) {
    activeId = id;
    const r = await api("/letter?id=" + encodeURIComponent(id));
    if (r.status === 401) { showAuth(); return; }
    if (!r.ok || !r.letter) return emptyListViewer("Письмо растворилось…");
    const l = r.letter;
    renderViewer(l);
    const fresh = await api("/inbox");
    if (fresh.ok) {
      letters = fresh.letters || [];
      renderList();
      elUnread.textContent = String(fresh.unread || 0);
    }
  }

  function renderViewer(l) {
    elView.innerHTML = "";
    const head = document.createElement("div");
    head.className = "mv-head";
    const subj = document.createElement("div");
    subj.className = "mv-subject";
    subj.textContent = l.subject;
    const meta = document.createElement("div");
    meta.className = "mv-meta";
    const who = document.createElement("span");
    who.append("От: ");
    const b1 = document.createElement("b");
    b1.textContent = (l.name ? l.name + " " : "") + "@" + l.from;
    const to = document.createElement("span");
    to.append("Кому: @");
    const b2 = document.createElement("b");
    b2.textContent = l.to;
    const date = document.createElement("span");
    date.textContent = new Date(l.ts).toLocaleString("ru-RU");
    meta.append(who, b1, to, b2, date);
    head.append(subj, meta);
    const body = document.createElement("div");
    body.className = "mv-body";
    body.textContent = l.body;
    const actions = document.createElement("div");
    actions.className = "mv-actions";
    const replyBtn = document.createElement("button");
    replyBtn.className = "btn btn-primary btn-sm";
    replyBtn.type = "button";
    replyBtn.textContent = "↩ Ответить";
    replyBtn.addEventListener("click", () => renderCompose(l.from, "Re: " + l.subject.replace(/^Re: /, "")));
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-ghost btn-sm";
    delBtn.type = "button";
    delBtn.textContent = "🗑 Удалить";
    delBtn.addEventListener("click", async () => {
      const d = await api("/delete", { body: { id: l.id } });
      if (d.ok) { activeId = null; emptyListViewer("Удалено ✦"); refresh(); }
    });
    actions.append(replyBtn, delBtn);
    elView.append(head, body, actions);
  }

  /* ---------- композ ---------- */
  async function loadDirectory() {
    const d = await api("/directory");
    if (d.ok && d.users) usersDir = d.users;
  }
  function renderCompose(to, subject) {
    elView.innerHTML = "";
    const lblTo = document.createElement("div");
    lblTo.className = "mc-label";
    lblTo.textContent = "Кому (@ник)";
    const inTo = document.createElement("input");
    inTo.className = "mc-input";
    inTo.id = "mcTo";
    inTo.placeholder = "nova, grim или ник соседа…";
    inTo.value = to || "";
    const dl = document.createElement("datalist");
    dl.id = "mcDir";
    dl.innerHTML = usersDir.map((u) => `<option value="${u}">`).join("");
    inTo.setAttribute("list", "mcDir");
    const lblS = document.createElement("div");
    lblS.className = "mc-label";
    lblS.textContent = "Тема";
    const inS = document.createElement("input");
    inS.className = "mc-input";
    inS.value = subject || "";
    inS.placeholder = "Без темы тоже отправляется";
    const lblB = document.createElement("div");
    lblB.className = "mc-label";
    lblB.textContent = "Письмо";
    const inB = document.createElement("textarea");
    inB.className = "mc-body";
    inB.id = "mcBody";
    inB.placeholder = "Текст письма…";
    const acts = document.createElement("div");
    acts.className = "mc-actions";
    const send = document.createElement("button");
    send.className = "btn btn-primary btn-sm";
    send.type = "button";
    send.textContent = "✈ Отправить";
    const note = document.createElement("div");
    note.className = "mc-note";
    note.textContent = "Доставка — мгновенная, до 4000 символов";
    acts.append(send, note);
    elView.append(lblTo, inTo, dl, lblS, inS, lblB, inB, acts);
    inTo.focus();

    send.addEventListener("click", async () => {
      const toU = inTo.value.trim().replace(/^@/, "").toLowerCase();
      if (!toU) { note.textContent = "Укажи получателя"; note.className = "mc-note err"; return; }
      if (!inB.value.trim()) { note.textContent = "Письмо пустое"; note.className = "mc-note err"; return; }
      send.disabled = true;
      note.textContent = "Отправляю через localhost…";
      note.className = "mc-note";
      try {
        const r = await api("/send", { body: { to: toU, subject: inS.value, body: inB.value } });
        if (r.status === 401) { showAuth(); return; }
        if (r.ok) {
          let txt = "✈ Доставлено @" + r.to;
          if (r.bounced) { txt = "📩 Bounce: ящика @" + r.to + " нет — письмо вернулось"; window.notify?.("📩 Письмо вернулось от mailer-daemon"); }
          else if (r.replied) { txt += " · пришёл ответ, проверь входящие"; window.notify?.("✉ " + r.to + " уже ответил — глянь входящие!"); }
          note.textContent = txt;
          note.className = "mc-note " + (r.bounced ? "warn" : "send");
          inB.value = "";
          await refresh();
        } else {
          note.textContent = r.error || "Ошибка отправки";
          note.className = "mc-note err";
        }
      } catch (_) {
        note.textContent = "Сервер не отвечает";
        note.className = "mc-note err";
      } finally {
        send.disabled = false;
      }
    });
  }

  $("#mailComposeBtn").addEventListener("click", () => {
    activeId = null;
    renderList();
    renderCompose("", "");
  });

  /* ---------- старт ---------- */
  showAuth();
  setMsg("");
  (async () => {
    if (!token) { setMsg("Всё живёт на твоём localhost — никакого облака"); return; }
    let me;
    try {
      me = await api("/me");
    } catch (_) {
      return showAuth("Почта работает рядом с сервером: запусти node serve.mjs локально, а на публичной версии нужен бэкенд-хостинг с функциями", "err");
    }
    if (me.ok && me.user) {
      myName = me.user;
      localStorage.setItem(USER_KEY, myName);
      await loadDirectory();
      showClient();
    } else if (me.status === 404) {
      showAuth("Здесь нет почтового сервера — запускай node serve.mjs на своём компе, там всё работает", "err");
    } else {
      showAuth();
    }
  })();
  setInterval(() => {
    if (!clientBox.classList.contains("hidden") && token) refresh().catch(() => {});
  }, 30000);
})();
