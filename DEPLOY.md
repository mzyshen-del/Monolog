# Monolog 静态网页部署

本项目的 `index.html`、`diary.html`、`guestbook.html`、CSS 和 JavaScript 可以直接作为静态文件发布，无需构建命令。仓库地址为 `https://github.com/mzyshen-del/mymonoblog`。

可以先发布只读版本以取得站点地址，再按 [Worker、Turnstile 与数据库部署](WORKER_DEPLOY_STEPS.md) 完成留言功能。`supabase-config.js` 只能包含 Supabase publishable key、Turnstile sitekey 和公开 API 地址，不得放入私有密钥。

## Vercel

1. 在 Vercel 导入现有 GitHub 仓库 `mzyshen-del/mymonoblog`。
2. Framework Preset 选 `Other`；Root Directory 保持仓库根目录；不设置 Build Command，Output Directory 留空。
3. 当前生产站点为 `https://mzyblog.vercel.app`；它已加入 Turnstile widget 和 Worker 的 `GUESTBOOK_ALLOWED_ORIGINS`。如更换站点域名，需要同步更新两处配置。
4. 再次部署并按下方清单验证。预览域名若不在允许列表内，只能阅读留言。

管理员密码找回使用 `https://mzyblog.vercel.app/reset-password.html` 作为回跳地址，已在 Supabase **Authentication → URL Configuration** 中配置。如更换站点域名，需要同步更新此地址。

## GitHub Pages

1. 在现有仓库的 **Settings → Pages** 选择 **Deploy from a branch**，分支选 `main`，目录选 `/ (root)`。
2. 发布地址通常为 `https://mzyshen-del.github.io/mymonoblog/`；以 GitHub Pages 实际显示的地址为准。
3. 将站点 origin `https://mzyshen-del.github.io` 加入 Turnstile widget 与 Worker 的允许列表。页面链接均使用相对路径。

## 上线验证

- 首页、日记和留言页可在电脑与手机宽度下打开；导航链接正确。
- 未登录可读日记和留言，不能编辑日记。
- 管理员登录、发布、编辑、删除日记均正常；过期令牌不会显示编辑入口。
- 访客完成 Turnstile 后能留言；过长留言和频繁提交得到明确提示。
- 使用 publishable key 直接向 `guestbook_messages` 插入数据会被拒绝。
- Network 面板及仓库历史中没有 Supabase secret key 或 Turnstile secret key。
