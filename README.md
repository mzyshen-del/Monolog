# Monolog

一个无需构建步骤的个人博客。访客可以阅读公开日记和留言；管理员登录后可以发布、编辑、删除日记。首页使用纯文本表情和响应式侧栏，保留轻量的静态站点结构。

> 生产站点已部署在 [mzyblog.vercel.app](https://mzyblog.vercel.app)。留言 Worker、Turnstile 和数据库策略已切换，部署方法见 [部署步骤](WORKER_DEPLOY_STEPS.md)。

## 我的贡献与协作方式

这是我与 Codex 协作完成的项目。我负责代码设计、确定关键方案、审查实现与测试结果，并对变更和发布作最终批准；Codex 根据这些设计和审查意见执行具体编码、测试及文档整理。项目中的权限边界、留言写入保护和网络故障处理都由我审核后决定是否采用。我对交付结果负责，并在 README 中标注验证范围。

## 功能与实现

| 功能 | 实现 |
| --- | --- |
| 首页与移动端导航 | 原生 HTML、CSS、JavaScript；无构建依赖 |
| 公开日记 | Supabase PostgREST 读取；管理员写入由 Auth JWT 和 RLS 控制 |
| 管理员密码找回 | 管理员邮箱接收 Supabase 重置邮件，站内设置新密码 |
| 访客留言 | Worker 验证 Turnstile、按来源限流后，用服务端密钥写入 Supabase |
| 网络故障处理 | 读取请求可在 Worker 与 Supabase 间切换，并在失败时显示本地缓存；写入请求不自动重发 |
| 内容渲染 | 日记与留言通过 `textContent` 插入页面，避免把用户文本作为 HTML 执行 |

### 数据流

```text
浏览器 ──公开读取/管理员登录──> Cloudflare Worker ──> Supabase Auth / PostgREST
   │                                  │
   └──留言 + Turnstile token──────────┘
                                      ├──验证 Turnstile、限流
                                      └──服务端密钥写入留言表
```

公开读取在代理不可用时可尝试直连 Supabase。管理员写入使用登录获得的 JWT；数据库的 RLS 决定是否授权。留言表不允许浏览器持有的 publishable key 直接插入。Turnstile sitekey 与 Supabase publishable key 是公开配置；Turnstile secret 和 Supabase secret 只配置在 Worker。

## 本地查看与测试

需要 Python 3 和 Node.js。站点本身不需要安装依赖。

```powershell
python -m http.server 8000
```

打开 `http://localhost:8000/`。现有 `supabase-config.js` 指向已配置的远端 API，因此本地页面也会尝试读取远端公开内容。留言功能只有在 Turnstile widget 允许本地 hostname，且 Worker 的 `GUESTBOOK_ALLOWED_ORIGINS` 包含 `http://localhost:8000` 时才可验证。

```powershell
node --test tests/*.test.cjs
```

测试覆盖读取故障切换、写入不重发、过期管理员令牌、留言来源限制、限流、Turnstile 验证和密码找回流程。测试使用模拟网络，不会写入真实数据库。

## 部署

- [静态网页部署](DEPLOY.md)
- [Worker、Turnstile 与数据库上线顺序](WORKER_DEPLOY_STEPS.md)
- [中国大陆访问加速说明](CN_ACCELERATION.md)

2026-10-19 的线上验收确认：首页、日记与留言页返回 200；公开日记和留言读取正常；完成 Turnstile 后的测试留言写入成功，随后已删除；匿名直接写入留言表返回 401；无效 Turnstile 令牌和旧直写入口均被 Worker 拒绝。项目负责人已在电脑和手机上验收页面与窗口显示，并确认密码找回、管理员登录及日记增删改正常。仓库没有包含私有密钥。
