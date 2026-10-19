const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const SUPABASE_URL = window.BLOG_SUPABASE_URL || "";
const SUPABASE_KEY = window.BLOG_SUPABASE_ANON_KEY || "";
const API_BASE = window.BLOG_API_BASE || SUPABASE_URL;
const ADMIN_EMAIL = (window.BLOG_ADMIN_EMAIL || "").toLowerCase();
const TURNSTILE_SITE_KEY = window.BLOG_TURNSTILE_SITE_KEY || "";
let runtimeApiBase = API_BASE;
const DIARY_CACHE_KEY = "blog_diary_cache";
const GUESTBOOK_CACHE_KEY = "blog_guestbook_cache";
const GUESTBOOK_MAX_LENGTH = 500;

const ACCESS_TOKEN_KEY = "blog_supabase_access_token";
const USER_EMAIL_KEY = "blog_supabase_user_email";

function initSidebarToggle() {
  const sidebars = document.querySelectorAll(".sidebar");
  sidebars.forEach((sidebar) => {
    const toggle = sidebar.querySelector(".sidebar-toggle");
    const nav = sidebar.querySelector(".side-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = sidebar.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    nav.addEventListener("click", () => {
      sidebar.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (!sidebar.contains(target)) {
        sidebar.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  });
}

function initEmojiInteraction() {
  const emojis = document.querySelectorAll(".emoji-bubble");
  emojis.forEach((item) => {
    item.addEventListener("click", () => {
      item.classList.remove("pop");
      void item.offsetWidth;
      item.classList.add("pop");
    });
    item.addEventListener("animationend", () => {
      if (item.classList.contains("pop")) {
        item.classList.remove("pop");
      }
    });
  });
}

function initPageTransitions() {
  const links = document.querySelectorAll('a[href$=".html"]');
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === "_blank") return;
      e.preventDefault();
      document.body.classList.add("is-leaving");
      setTimeout(() => {
        window.location.href = href;
      }, 220);
    });
  });
}

function hasConfig() {
  return (
    typeof API_BASE === "string" &&
    typeof SUPABASE_KEY === "string" &&
    API_BASE.startsWith("https://") &&
    SUPABASE_KEY.length > 20
  );
}

function formatTime(ts) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
}

function getCurrentEmail() {
  return (localStorage.getItem(USER_EMAIL_KEY) || "").toLowerCase();
}

function setSession(accessToken, email) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken || "");
  localStorage.setItem(USER_EMAIL_KEY, email || "");
}

function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
}

async function sbRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const token = options.token || "";
  const body = options.body;
  const prefer = options.prefer;

  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;

  async function doFetch(base) {
    return fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // A write may have reached Supabase even when its response was lost.
  // Only reads are safe to repeat against another endpoint.
  const candidates = [runtimeApiBase];
  const altBase = runtimeApiBase === API_BASE ? SUPABASE_URL : API_BASE;
  if (method === "GET" && altBase && !candidates.includes(altBase)) candidates.push(altBase);

  let lastErr = null;
  for (const base of candidates) {
    let resp;
    try {
      resp = await doFetch(base);
    } catch (err) {
      lastErr = err;
      continue;
    }

    // A read may use the alternate endpoint after a transient server error.
    if (resp.status >= 500) {
      lastErr = new Error(`HTTP ${resp.status}`);
      continue;
    }

    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      try {
        const err = await resp.json();
        message = err.msg || err.message || err.error_description || err.error || message;
      } catch {
        try {
          const text = await resp.text();
          if (text) message = text;
        } catch {}
      }
      const error = new Error(message);
      error.status = resp.status;
      throw error;
    }

    runtimeApiBase = base;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) return resp.json();
    return null;
  }

  throw lastErr || new Error("request failed");
}

async function apiLogin(email, password) {
  return sbRequest(`/auth/v1/token?grant_type=password`, {
    method: "POST",
    body: { email, password },
  });
}

async function apiGetUser(token) {
  return sbRequest(`/auth/v1/user`, { token });
}

async function apiLoadDiary() {
  return sbRequest(`/rest/v1/diary_entries?select=id,title,content,created_at,updated_at&order=updated_at.desc`);
}

async function apiCreateDiary(token, title, content) {
  return sbRequest(`/rest/v1/diary_entries`, {
    method: "POST",
    token,
    body: [{ title, content, updated_at: new Date().toISOString() }],
    prefer: "return=representation",
  });
}

async function apiUpdateDiary(token, id, title, content) {
  return sbRequest(`/rest/v1/diary_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: { title, content, updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
}

async function apiDeleteDiary(token, id) {
  return sbRequest(`/rest/v1/diary_entries?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

async function apiLoadGuestbook() {
  return sbRequest(`/rest/v1/guestbook_messages?select=id,content,created_at&order=created_at.desc&limit=100`);
}

async function apiInsertGuestbook(content, turnstileToken) {
  const response = await fetch(`${API_BASE}/guestbook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, turnstileToken }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

initGuestbook();
initDiary();
initSidebarToggle();
initEmojiInteraction();
initPageTransitions();

async function initGuestbook() {
  const guestForm = document.getElementById("guest-form");
  const messageList = document.getElementById("message-list");
  const statusEl = document.getElementById("guestbook-status");
  if (!guestForm || !messageList) return;

  if (!hasConfig()) {
    if (statusEl) statusEl.textContent = "配置无效：请检查 supabase-config.js。";
    return;
  }

  const submitBtn = guestForm.querySelector('button[type="submit"]');
  let turnstileWidgetId = null;
  if (submitBtn) submitBtn.disabled = true;
  if (!TURNSTILE_SITE_KEY || API_BASE === SUPABASE_URL) {
    if (statusEl) statusEl.textContent = "留言验证尚未配置，暂时只能阅读留言。";
  } else {
    const challengeScript = document.createElement("script");
    challengeScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    challengeScript.async = true;
    challengeScript.onload = () => {
      try {
        turnstileWidgetId = window.turnstile.render("#guestbook-turnstile", {
          sitekey: TURNSTILE_SITE_KEY,
          size: "flexible",
        });
        if (submitBtn) submitBtn.disabled = false;
        if (statusEl) statusEl.textContent = "完成验证后即可留言。";
      } catch {
        if (statusEl) statusEl.textContent = "留言验证加载失败，请刷新页面。";
      }
    };
    challengeScript.onerror = () => {
      if (statusEl) statusEl.textContent = "留言验证加载失败，请检查网络。";
    };
    document.head.appendChild(challengeScript);
  }

  async function loadMessages() {
    messageList.innerHTML = "";
    try {
      const data = await apiLoadGuestbook();
      localStorage.setItem(GUESTBOOK_CACHE_KEY, JSON.stringify(data || []));
      if (!data || !data.length) {
        const li = document.createElement("li");
        li.textContent = "还没有留言，来写第一条吧。";
        messageList.appendChild(li);
        return;
      }

      data.forEach((row) => {
        const li = document.createElement("li");
        const p1 = document.createElement("p");
        p1.textContent = row.content;
        const p2 = document.createElement("p");
        p2.className = "diary-meta";
        p2.textContent = formatTime(row.created_at);
        li.appendChild(p1);
        li.appendChild(p2);
        messageList.appendChild(li);
      });
    } catch (e) {
      const cache = localStorage.getItem(GUESTBOOK_CACHE_KEY);
      const cached = cache ? JSON.parse(cache) : [];
      if (cached.length) {
        cached.forEach((row) => {
          const li = document.createElement("li");
          const p1 = document.createElement("p");
          p1.textContent = row.content;
          const p2 = document.createElement("p");
          p2.className = "diary-meta";
          p2.textContent = formatTime(row.created_at);
          li.appendChild(p1);
          li.appendChild(p2);
          messageList.appendChild(li);
        });
        if (statusEl) statusEl.textContent = "网络不稳定，已显示缓存留言。";
      } else {
        const li = document.createElement("li");
        li.textContent = "留言加载失败。";
        messageList.appendChild(li);
        if (statusEl) statusEl.textContent = `留言加载失败：${e.message}`;
      }
    }
  }

  guestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn?.disabled) return;
    const fd = new FormData(guestForm);
    const content = String(fd.get("message") || "").trim();
    if (!content) return;
    if (content.length > GUESTBOOK_MAX_LENGTH) {
      if (statusEl) statusEl.textContent = `留言不能超过 ${GUESTBOOK_MAX_LENGTH} 个字符。`;
      return;
    }
    const turnstileToken = turnstileWidgetId === null
      ? "" : window.turnstile.getResponse(turnstileWidgetId);
    if (!turnstileToken) {
      if (statusEl) statusEl.textContent = "请先完成留言验证。";
      return;
    }

    if (statusEl) statusEl.textContent = "正在提交留言...";
    if (submitBtn) submitBtn.disabled = true;
    try {
      await apiInsertGuestbook(content, turnstileToken);
      guestForm.reset();
      if (statusEl) statusEl.textContent = "留言成功。";
      await loadMessages();
    } catch (err) {
      if (statusEl) statusEl.textContent = `留言失败：${err.message}`;
    } finally {
      if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  await loadMessages();
  setInterval(loadMessages, 8000);
}

async function initDiary() {
  const diaryForm = document.getElementById("diary-form");
  const diaryList = document.getElementById("diary-list");
  const diaryTitle = document.getElementById("diary-title");
  const diaryContent = document.getElementById("diary-content");
  const diaryEditId = document.getElementById("diary-edit-id");
  const diarySaveBtn = document.getElementById("diary-save-btn");
  const diaryCancelBtn = document.getElementById("diary-cancel-btn");
  const diaryStatus = document.getElementById("diary-status");

  const loginForm = document.getElementById("admin-login-form");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const authStatus = document.getElementById("admin-auth-status");

  if (!diaryList) return;
  if (authStatus) authStatus.textContent = "页面初始化中...";

  if (!hasConfig()) {
    if (authStatus) authStatus.textContent = "配置无效：请检查 supabase-config.js。";
    return;
  }

  let isAdmin = false;

  function setEditorVisible(visible) {
    if (!diaryForm) return;
    diaryForm.classList.toggle("hidden", !visible);
  }

  function clearDiaryForm() {
    if (!diaryTitle || !diaryContent || !diaryEditId || !diarySaveBtn) return;
    diaryTitle.value = "";
    diaryContent.value = "";
    diaryEditId.value = "";
    diarySaveBtn.textContent = "保存日记";
  }

  function renderEntries(entries) {
    diaryList.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("article");
      empty.className = "diary-card";
      empty.innerHTML = "<h3>还没有日记</h3><p>管理员登录后可发布第一篇。</p>";
      diaryList.appendChild(empty);
      return;
    }

    entries.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "diary-card";

      const h3 = document.createElement("h3");
      h3.textContent = entry.title;
      const meta = document.createElement("p");
      meta.className = "diary-meta";
      meta.textContent = `更新于 ${formatTime(entry.updated_at || entry.created_at)}`;
      const body = document.createElement("p");
      body.className = "diary-body";
      body.textContent = entry.content;

      card.appendChild(h3);
      card.appendChild(meta);
      card.appendChild(body);

      if (isAdmin) {
        const actions = document.createElement("div");
        actions.className = "diary-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn";
        editBtn.textContent = "编辑";
        editBtn.dataset.action = "edit";
        editBtn.dataset.id = entry.id;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn";
        delBtn.textContent = "删除";
        delBtn.dataset.action = "delete";
        delBtn.dataset.id = entry.id;

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(actions);
      }

      diaryList.appendChild(card);
    });
  }

  async function loadEntries() {
    try {
      const data = await apiLoadDiary();
      localStorage.setItem(DIARY_CACHE_KEY, JSON.stringify(data || []));
      renderEntries(data || []);
    } catch (e) {
      const cache = localStorage.getItem(DIARY_CACHE_KEY);
      const cached = cache ? JSON.parse(cache) : [];
      if (cached.length) {
        renderEntries(cached);
        if (authStatus) authStatus.textContent = "网络不稳定，已显示缓存日记。";
      } else {
        renderEntries([]);
        if (authStatus) authStatus.textContent = `日记加载失败：${e.message}`;
      }
    }
  }

  async function refreshAuthState() {
    const token = getToken();
    isAdmin = false;
    setEditorVisible(false);
    if (token) {
      if (authStatus) authStatus.textContent = "正在验证登录状态...";
      try {
        const user = await apiGetUser(token);
        const email = String(user?.email || "").toLowerCase();
        isAdmin = email === ADMIN_EMAIL;
        if (isAdmin) setSession(token, email);
        else clearSession();
      } catch (err) {
        if (err.status === 401 || err.status === 403) clearSession();
        if (authStatus && err.status !== 401 && err.status !== 403) {
          authStatus.textContent = "暂时无法验证登录状态，请检查网络后刷新页面。";
        }
      }
    }
    setEditorVisible(isAdmin);
    if (authStatus && (!token || isAdmin || !getToken())) {
      authStatus.textContent = isAdmin
        ? `已以管理员身份登录：${getCurrentEmail()}`
        : "未登录时只可查看日记。";
    }

    await loadEntries();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailInput = document.getElementById("admin-email");
      const passwordInput = document.getElementById("admin-password");
      const email = emailInput ? emailInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";
      if (!email || !password) {
        if (authStatus) authStatus.textContent = "请输入邮箱和密码。";
        return;
      }

      if (authStatus) authStatus.textContent = "正在登录...";
      try {
        const data = await apiLogin(email, password);
        const accessToken = data && data.access_token ? data.access_token : "";
        const userEmail = data && data.user && data.user.email ? data.user.email : email;
        if (!accessToken) throw new Error("未获取到 access token");

        const lowerEmail = String(userEmail).toLowerCase();
        if (lowerEmail !== ADMIN_EMAIL) {
          if (authStatus) authStatus.textContent = "登录成功，但该账号不是管理员邮箱。";
          return;
        }

        const user = await apiGetUser(accessToken);
        if (String(user?.email || "").toLowerCase() !== ADMIN_EMAIL) {
          throw new Error("管理员身份验证失败");
        }
        setSession(accessToken, lowerEmail);
        if (passwordInput) passwordInput.value = "";
        isAdmin = true;
        setEditorVisible(true);
        if (authStatus) authStatus.textContent = `已以管理员身份登录：${lowerEmail}`;
        await loadEntries();
      } catch (err) {
        clearSession();
        if (authStatus) authStatus.textContent = `登录失败：${err.message}`;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      clearSession();
      isAdmin = false;
      setEditorVisible(false);
      clearDiaryForm();
      if (authStatus) authStatus.textContent = "已退出登录。";
      await loadEntries();
    });
  }

  if (diaryForm && diaryTitle && diaryContent && diaryEditId && diarySaveBtn && diaryCancelBtn) {
    diaryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAdmin) return;
      if (diarySaveBtn.disabled) return;

      const token = getToken();
      const title = diaryTitle.value.trim();
      const content = diaryContent.value.trim();
      if (!title || !content) return;

      const editId = diaryEditId.value.trim();
      diarySaveBtn.disabled = true;
      try {
        if (editId) {
          await apiUpdateDiary(token, editId, title, content);
          if (diaryStatus) diaryStatus.textContent = "日记已更新。";
        } else {
          await apiCreateDiary(token, title, content);
          if (diaryStatus) diaryStatus.textContent = "日记已发布。";
        }
        clearDiaryForm();
        await loadEntries();
      } catch (err) {
        if (diaryStatus) diaryStatus.textContent = `保存失败：${err.message}`;
        if (err.status === 401 || err.status === 403) await refreshAuthState();
      } finally {
        diarySaveBtn.disabled = false;
      }
    });

    diaryCancelBtn.addEventListener("click", () => {
      clearDiaryForm();
      if (diaryStatus) diaryStatus.textContent = "已取消编辑。";
    });

    diaryList.addEventListener("click", async (e) => {
      if (!isAdmin) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!action || !id) return;

      const token = getToken();

      if (action === "delete") {
        try {
          await apiDeleteDiary(token, id);
          if (diaryStatus) diaryStatus.textContent = "日记已删除。";
          await loadEntries();
        } catch (err) {
          if (diaryStatus) diaryStatus.textContent = `删除失败：${err.message}`;
          if (err.status === 401 || err.status === 403) await refreshAuthState();
        }
        return;
      }

      if (action === "edit") {
        try {
          const all = await apiLoadDiary();
          const data = (all || []).find((x) => x.id === id);
          if (!data) throw new Error("未找到该日记");

          diaryEditId.value = data.id;
          diaryTitle.value = data.title;
          diaryContent.value = data.content;
          diarySaveBtn.textContent = "保存修改";
          diaryTitle.focus();
        } catch (err) {
          if (diaryStatus) diaryStatus.textContent = `无法加载编辑内容：${err.message}`;
        }
      }
    });
  }

  await refreshAuthState();
  setInterval(loadEntries, 10000);
}
