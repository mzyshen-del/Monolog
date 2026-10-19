(() => {
  const base = window.BLOG_SUPABASE_URL;
  const apiKey = window.BLOG_SUPABASE_ANON_KEY;
  const adminEmail = (window.BLOG_ADMIN_EMAIL || "").toLowerCase();
  const requestForm = document.getElementById("recovery-request-form");
  const updateForm = document.getElementById("recovery-update-form");
  const status = document.getElementById("recovery-status");
  let recoveryToken = "";

  function message(value) { status.textContent = value; }
  async function authRequest(path, options = {}) {
    const response = await fetch(`${base}/auth/v1${path}`, {
      method: options.method || "GET",
      headers: {
        apikey: apiKey,
        "content-type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || `HTTP ${response.status}`);
    return data;
  }

  const fragment = new URLSearchParams(location.hash.slice(1));
  const accessToken = fragment.get("access_token") || "";
  const recoveryType = fragment.get("type");
  const linkError = fragment.get("error_description") || fragment.get("error");
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);

  if (!base?.startsWith("https://") || !apiKey || !adminEmail) {
    message("重置功能尚未配置，请联系站点管理员。");
    return;
  }

  if (accessToken && recoveryType === "recovery") {
    message("正在检查重置链接…");
    authRequest("/user", { token: accessToken }).then((user) => {
      if ((user.email || "").toLowerCase() !== adminEmail) throw new Error("此链接不属于博客管理员。");
      recoveryToken = accessToken;
      updateForm.classList.remove("hidden");
      message("请设置至少 12 位的新密码。");
    }).catch((error) => {
      message(`重置链接无效或已过期：${error.message}`);
      requestForm.classList.remove("hidden");
    });
  } else {
    requestForm.classList.remove("hidden");
    if (linkError) message(`重置链接无效或已过期：${linkError}`);
  }

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = requestForm.querySelector("button");
    button.disabled = true;
    message("正在发送重置邮件…");
    try {
      const redirect = `${location.origin}/reset-password.html`;
      await authRequest(`/recover?redirect_to=${encodeURIComponent(redirect)}`, {
        method: "POST", body: { email: adminEmail },
      });
      message("如果管理员邮箱存在，重置邮件会发送到该邮箱。请检查收件箱和垃圾邮件。");
    } catch (error) {
      message(`发送失败：${error.message}`);
    } finally {
      button.disabled = false;
    }
  });

  updateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("new-password").value;
    const confirmation = document.getElementById("confirm-password").value;
    if (password !== confirmation) { message("两次输入的密码不一致。"); return; }
    if (!recoveryToken) { message("重置链接无效，请重新发送邮件。"); return; }
    const button = updateForm.querySelector("button");
    button.disabled = true;
    try {
      await authRequest("/user", { method: "PUT", token: recoveryToken, body: { password } });
      recoveryToken = "";
      updateForm.reset();
      updateForm.classList.add("hidden");
      message("密码已更新。请返回日记页，用新密码登录。");
    } catch (error) {
      message(`更新失败：${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
})();
