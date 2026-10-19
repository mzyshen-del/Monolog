const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "reset-password.js"), "utf8");

function setup(hash = "") {
  const elements = new Map();
  for (const id of ["recovery-request-form", "recovery-update-form", "recovery-status", "new-password", "confirm-password"]) {
    const classes = new Set(["hidden"]);
    elements.set(id, {
      value: "", textContent: "", disabled: false,
      handlers: {},
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelector() { return this.button ||= { disabled: false }; },
      reset() { elements.get("new-password").value = ""; elements.get("confirm-password").value = ""; },
    });
  }
  const requests = [];
  const context = {
    window: {
      BLOG_SUPABASE_URL: "https://example.supabase.co",
      BLOG_SUPABASE_ANON_KEY: "public-key",
      BLOG_ADMIN_EMAIL: "admin@example.com",
    },
    document: { getElementById: (id) => elements.get(id) },
    location: { hash, pathname: "/reset-password", search: "", origin: "https://mzyblog.vercel.app" },
    history: { replaceState(...args) { context.clearedUrl = args[2]; } },
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => url.endsWith("/user") && options.method === "GET"
          ? { email: "admin@example.com" } : {},
      };
    },
  };
  vm.runInNewContext(source, context);
  return { elements, requests, context };
}

test("recovery request targets the production reset page", async () => {
  const { elements, requests } = setup();
  const form = elements.get("recovery-request-form");
  assert.equal(form.classList.contains("hidden"), false);
  await form.handlers.submit({ preventDefault() {} });
  assert.match(requests[0].url, /\/recover\?redirect_to=https%3A%2F%2Fmzyblog\.vercel\.app%2Freset-password\.html$/);
  assert.equal(JSON.parse(requests[0].options.body).email, "admin@example.com");
});

test("recovery token is removed from URL and used only for password update", async () => {
  const { elements, requests, context } = setup("#access_token=sample-token&type=recovery");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.clearedUrl, "/reset-password");
  const form = elements.get("recovery-update-form");
  assert.equal(form.classList.contains("hidden"), false);
  elements.get("new-password").value = "new-secure-password";
  elements.get("confirm-password").value = "new-secure-password";
  await form.handlers.submit({ preventDefault() {} });
  assert.equal(requests[1].url, "https://example.supabase.co/auth/v1/user");
  assert.equal(requests[1].options.method, "PUT");
  assert.equal(requests[1].options.headers.Authorization, "Bearer sample-token");
  assert.equal(JSON.parse(requests[1].options.body).password, "new-secure-password");
  assert.equal(form.classList.contains("hidden"), true);
});
