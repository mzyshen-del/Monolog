# Worker 与留言板部署

留言由 Cloudflare Worker 验证 Turnstile、限流后写入 Supabase。浏览器只持有 Supabase publishable key 和 Turnstile sitekey。不要把 Supabase secret key 或 Turnstile secret key 放进仓库或网页。

## 准备

1. 在 Cloudflare 创建 Turnstile widget，加入实际部署的站点域名，记录公开的 sitekey 和私有的 secret key。
2. 在 Supabase 项目中创建 `sb_secret_...` secret key，专供这个 Worker 使用。
3. 确认 `wrangler.toml` 中的 `SUPABASE_URL` 属于目标项目。

在仓库根目录执行：

```powershell
npx wrangler login
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put GUESTBOOK_ALLOWED_ORIGINS
npx wrangler deploy
```

`SUPABASE_ANON_KEY` 输入现有 `sb_publishable_...`；`SUPABASE_SECRET_KEY` 输入 `sb_secret_...`；`TURNSTILE_SECRET_KEY` 输入 widget 的 secret key。`GUESTBOOK_ALLOWED_ORIGINS` 输入网页的完整 origin，例如 `https://example.com`；多个 origin 用英文逗号分隔，不要带路径或末尾斜杠。Wrangler 配置提供每个 IP 每分钟 10 次的近似限流；共享出口网络可能共用额度。

## 切换网页与数据库

1. 将公开 sitekey 填入 `supabase-config.js` 的 `BLOG_TURNSTILE_SITE_KEY`；确认 `BLOG_API_BASE` 指向刚部署的 Worker。
2. 发布静态网页。此时访客应能完成验证并提交留言。Worker 更新到网页更新之间，留言写入可能短暂不可用。
3. 在 Supabase SQL Editor 执行 `supabase-schema.sql`。脚本会移除旧的公开插入策略和 `anon`/`authenticated` 插入授权，并对新留言强制执行 1～500 字符限制；旧留言不会被删除。
4. 重新验证：网页留言成功；直接使用 publishable key 向 `guestbook_messages` 发 `POST` 应被拒绝；日记阅读及管理员编辑仍正常。

如需回滚前端，先恢复 Worker 和数据库写入流程的可用性；不要仅恢复旧网页，因为匿名直写已关闭。查看 Worker 错误可运行 `npx wrangler tail`。私有密钥只通过 Wrangler secrets 配置。
