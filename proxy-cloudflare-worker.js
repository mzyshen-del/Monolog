function guestbookResponse(body, status, origin) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function handleGuestbook(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = String(env.GUESTBOOK_ALLOWED_ORIGINS || "")
    .split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowedOrigins.includes(origin)) {
    return guestbookResponse({ message: "Origin not allowed" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }
  if (request.method !== "POST") {
    return guestbookResponse({ message: "Method not allowed" }, 405, origin);
  }
  if (!env.TURNSTILE_SECRET_KEY || !env.SUPABASE_SECRET_KEY || !env.GUESTBOOK_RATE_LIMITER) {
    return guestbookResponse({ message: "Guestbook is not configured" }, 503, origin);
  }
  if (Number(request.headers.get("Content-Length") || 0) > 4096) {
    return guestbookResponse({ message: "Request too large" }, 413, origin);
  }

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return guestbookResponse({ message: "Request too large" }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return guestbookResponse({ message: "Invalid JSON" }, 400, origin);
  }
  const content = typeof payload?.content === "string" ? payload.content.trim() : "";
  const token = typeof payload?.turnstileToken === "string" ? payload.turnstileToken : "";
  if (!content || [...content].length > 500 || !token || token.length > 2048) {
    return guestbookResponse({ message: "Invalid message or verification" }, 400, origin);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await env.GUESTBOOK_RATE_LIMITER.limit({ key: `guestbook:${ip}` });
  if (!success) return guestbookResponse({ message: "留言过于频繁，请稍后再试。" }, 429, origin);

  let verification;
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    });
    if (!result.ok) throw new Error("Siteverify unavailable");
    verification = await result.json();
  } catch {
    return guestbookResponse({ message: "验证服务暂时不可用。" }, 502, origin);
  }
  if (!verification.success || verification.hostname !== new URL(origin).hostname) {
    return guestbookResponse({ message: "验证失败，请重试。" }, 403, origin);
  }

  const upstream = new URL(env.SUPABASE_URL);
  upstream.pathname = "/rest/v1/guestbook_messages";
  try {
    const result = await fetch(upstream.toString(), {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{ content }]),
    });
    if (!result.ok) {
      return guestbookResponse({ message: "留言保存失败，请稍后确认是否已发布。" }, 502, origin);
    }
  } catch {
    return guestbookResponse({ message: "留言状态未知，请刷新列表确认。" }, 502, origin);
  }
  return guestbookResponse({ ok: true }, 201, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upstreamBase = String(env.SUPABASE_URL || "");
    if (!upstreamBase.startsWith("https://")) {
      return new Response("SUPABASE_URL is invalid", { status: 500 });
    }

    const upstream = new URL(upstreamBase);

    if (url.pathname === "/guestbook") {
      return handleGuestbook(request, env);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, proxy: "shenmu-supabase-proxy", upstream: upstream.origin }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
          },
        }
      );
    }

    // Only proxy Supabase Auth/REST endpoints
    if (!url.pathname.startsWith("/auth/v1/") && !url.pathname.startsWith("/rest/v1/")) {
      return new Response("Not Found", { status: 404 });
    }

    // Public messages may only be inserted through the verified /guestbook route.
    if (url.pathname === "/rest/v1/guestbook_messages" && request.method !== "GET" && request.method !== "OPTIONS") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    upstream.pathname = url.pathname;
    upstream.search = url.search;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, Prefer",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("apikey", env.SUPABASE_ANON_KEY);

    let resp;
    try {
      resp = await fetch(upstream.toString(), {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err?.message || "unknown error"}`, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const out = new Response(resp.body, resp);
    out.headers.set("Access-Control-Allow-Origin", "*");
    out.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    out.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, Prefer");
    return out;
  },
};
