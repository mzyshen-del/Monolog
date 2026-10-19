# Mainland Acceleration (API Proxy)

## Goal
Use a proxy domain in front of Supabase so mainland users access:
- `https://your-proxy-domain/auth/v1/...`
- `https://your-proxy-domain/rest/v1/...`

## 1) Deploy proxy (Cloudflare Workers)

1. Create a Worker and paste `proxy-cloudflare-worker.js`.
2. Add env vars in Worker settings:
   - `SUPABASE_URL` = your project URL, e.g. `https://ndiyifgkqlzoodfarlxh.supabase.co`
   - `SUPABASE_ANON_KEY` = your publishable key (`sb_publishable_...`)
   - Guestbook writes also require the server-only secrets and Turnstile setup in `WORKER_DEPLOY_STEPS.md`.
3. Bind a custom domain to the Worker, e.g. `https://api.shenmu.cn`.

## 2) Switch frontend to proxy

Edit `supabase-config.js`:

```js
window.BLOG_API_BASE = "https://api.shenmu.cn";
```

Keep these unchanged:
- `BLOG_SUPABASE_URL`
- `BLOG_SUPABASE_ANON_KEY`

## 3) Verify

1. Open Diary and Guestbook from mainland network.
2. Check login / read / write behavior is normal.
3. If CORS error appears, confirm Worker CORS headers are present.

## Notes
- Do not expose a Supabase secret key in frontend code.
- Auth and reads use the publishable key and user token. Guestbook writes use the Worker-only secret key after verification.

## Quick Start (PowerShell)
See `WORKER_DEPLOY_STEPS.md` for copy-paste commands.
