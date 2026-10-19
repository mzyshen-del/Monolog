const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function createApp(fetchImpl, { elements = {}, initialStorage = {} } = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const context = vm.createContext({
    window: {
      BLOG_SUPABASE_URL: "https://direct.example",
      BLOG_SUPABASE_ANON_KEY: "public-key-long-enough-for-test",
      BLOG_API_BASE: "https://proxy.example",
      BLOG_ADMIN_EMAIL: "admin@example.com",
    },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      createElement: () => ({ className: "", innerHTML: "" }),
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch: fetchImpl,
    setInterval: () => {},
    setTimeout: () => {},
    console,
  });
  vm.runInContext(source, context);
  return context;
}

test("a failed POST is never replayed through the fallback endpoint", async () => {
  const calls = [];
  const app = createApp(async (url) => {
    calls.push(url);
    return { status: 502, ok: false };
  });

  await assert.rejects(app.sbRequest("/rest/v1/guestbook_messages", {
    method: "POST", body: [{ content: "hello" }],
  }), /HTTP 502/);
  assert.deepEqual(calls, ["https://proxy.example/rest/v1/guestbook_messages"]);
});

test("a failed GET can use the direct endpoint", async () => {
  const calls = [];
  const app = createApp(async (url) => {
    calls.push(url);
    if (calls.length === 1) return { status: 502, ok: false };
    return {
      status: 200, ok: true,
      headers: { get: () => "application/json" },
      json: async () => [{ id: 1 }],
    };
  });

  const rows = await app.sbRequest("/rest/v1/guestbook_messages");
  assert.equal(rows.length, 1);
  assert.deepEqual(calls, [
    "https://proxy.example/rest/v1/guestbook_messages",
    "https://direct.example/rest/v1/guestbook_messages",
  ]);
});

test("publishable keys stay in apikey while user JWTs use Authorization", async () => {
  const requests = [];
  const app = createApp(async (_url, options) => {
    requests.push(options.headers);
    return {
      status: 200, ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({}),
    };
  });
  await app.sbRequest("/rest/v1/diary_entries");
  await app.apiGetUser("user-jwt");
  assert.equal(requests[0].Authorization, undefined);
  assert.equal(requests[1].Authorization, "Bearer user-jwt");
  assert.equal(requests[0].apikey, "public-key-long-enough-for-test");
});

test("authentication errors retain their HTTP status", async () => {
  let calls = 0;
  const app = createApp(async () => ({
    status: 401, ok: false,
    json: async () => { calls += 1; return { message: "expired token" }; },
  }));
  await assert.rejects(app.apiGetUser("expired"), (error) =>
    error.status === 401 && error.message === "expired token");
  assert.equal(calls, 1);
});

test("an expired stored token never reveals the diary editor", async () => {
  let editorHidden = null;
  const status = { textContent: "" };
  const app = createApp(async (url) => url.includes("/auth/v1/user")
    ? { status: 401, ok: false, json: async () => ({ message: "expired" }) }
    : {
      status: 200, ok: true,
      headers: { get: () => "application/json" },
      json: async () => [],
    }, {
    initialStorage: {
      blog_supabase_access_token: "expired",
      blog_supabase_user_email: "admin@example.com",
    },
    elements: {
      "diary-list": { innerHTML: "", appendChild: () => {} },
      "diary-form": { classList: { toggle: (_name, hidden) => { editorHidden = hidden; } } },
      "admin-auth-status": status,
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(editorHidden, true);
  assert.equal(app.getToken(), "");
  assert.match(status.textContent, /未登录/);
});
