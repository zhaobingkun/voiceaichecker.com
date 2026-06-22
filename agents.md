# 项目说明书

## 项目背景

Voice AI Checker 是一个 AI 语音检测网站。项目使用 Node.js 提供 API 和本地静态文件服务，并通过 Vercel 发布。

## 目标与边界

- 为用户提供可访问、可抓取的 AI 语音检测页面与相关说明内容。
- 网站页面和公开资源遵循 SEO、可访问性与安全基本规范。
- 核心正文应出现在原始 HTML 中，不依赖客户端 JavaScript 才能读取。
- 不在仓库中提交密钥、访问令牌或其他敏感配置。

## 项目结构约定

- `public/`：公开静态文件；其中的文件会发布到网站根路径。
- `api/`：Vercel Serverless API。
- `src/`：服务端业务代码与配置。
- `server.js`：本地 Node.js 服务入口。
- `vercel.json`：Vercel 路由、响应头和重定向配置。

## 工作规则

1. 每次工作前先读取 `agents.md` 和 `memory.md`。
2. 重要决策、验证结果和后续事项写入 `memory.md`。
3. 修改前检查现有工作区，保留用户已有改动。
4. 修改后进行与风险相称的验证。
5. 新增网站页面时检查 title、meta description、canonical、OG、结构化数据、内链、sitemap 和 robots 行为。

