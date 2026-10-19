const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "proxy-cloudflare-worker.js"), "utf8");
const workerPromise = import(`data:text/javascript,${encodeURIComponent(source)}`);
const origin = "https://blog.example";

function env(limit = true) {
  return {
    SUPABASE_URL: "https://db.example",
    SUPABASE_SECRET_KEY: "server-only-test-key",
    TURNSTILE_SECRET_KEY: "turnstile-test-secret",
    GUESTBOOK_ALLOWED_ORIGINS: origin,
    GUESTBOOK_RATE_LIMITER: { limit: async () => ({ success: limit }) },
  };
}

function request(pathname, body, from = origin) {
  return new Request(`https://proxy.example${pathname}`, {
    method: "POST",
    headers: { Origin: from, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
    body: JSON.stringify(body),
  });
}

test("direct public guestbook inserts cannot pass through the proxy", async () => {
  const worker = (await workerPromise).default;
  const response = await worker.fetch(request("/rest/v1/guestbook_messages", [{ content: "x" }]), env());
  assert.equal(response.status, 405);
});

test("unapproved origins and rate-limited requests cannot write", async () => {
  const worker = (await workerPromise).default;
  const body = { content: "hello", turnstileToken: "token" };
  const denied = await worker.fetch(request("/guestbook", body, "https://other.example"), env());
  assert.equal(denied.status, 403);
  const limited = await worker.fetch(request("/guestbook", body), env(false));
  assert.equal(limited.status, 429);
});

test("a valid guestbook post verifies Turnstile before using the server key", async () => {
  const worker = (await workerPromise).default;
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("siteverify")) {
      return { ok: true, json: async () => ({ success: true, hostname: "blog.example" }) };
    }
    return { ok: true };
  };
  try {
    const response = await worker.fetch(request("/guestbook", {
      content: " hello ", turnstileToken: "token",
    }), env());
    assert.equal(response.status, 201);
    assert.equal(calls.length, 2);
    assert.match(String(calls[0].url), /siteverify/);
    assert.equal(calls[1].options.headers.apikey, "server-only-test-key");
    assert.deepEqual(JSON.parse(calls[1].options.body), [{ content: "hello" }]);
  } finally {
    global.fetch = oldFetch;
  }
});

test("failed Turnstile verification never reaches the database", async () => {
  const worker = (await workerPromise).default;
  let calls = 0;
  const oldFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ success: false }) };
  };
  try {
    const response = await worker.fetch(request("/guestbook", {
      content: "hello", turnstileToken: "invalid",
    }), env());
    assert.equal(response.status, 403);
    assert.equal(calls, 1);
  } finally {
    global.fetch = oldFetch;
  }
});
