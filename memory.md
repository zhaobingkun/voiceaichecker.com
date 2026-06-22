# 项目经验记录

## 2026-06-18

- 网站实际项目目录为 `voiceaichecker.com/`。
- 根路径公开的静态文件应放在 `voiceaichecker.com/public/`。
- `public/3ffcc59b6b3a47aa93607827318019c0.txt` 已在正确位置；发布后预期地址为 `https://voiceaichecker.com/3ffcc59b6b3a47aa93607827318019c0.txt`。
- 本地 `server.js` 会从 `public/` 提供静态文件；Vercel 也会直接发布 `public/` 中的文件。

## 2026-06-22

- 核查支付测试状态：Creem checkout、webhook 签名校验、Supabase 订阅状态写入和 Pro 配额代码已经实现，支付代码主要在 2026-06-14 的提交 `193dfd0` 中加入。
- 仓库没有支付自动化测试文件，也没有成功创建测试订单、收到测试 webhook、写入 Pro 状态或完成退款/取消流程的记录，因此不能认定支付链路已测试通过。
- 当前本地 `.env` 未包含 Creem 与 Supabase 支付配置项；`.env.example` 只有配置模板。
- 尝试读取线上 `/api/health` 与 `/pricing/` 时网络请求超时，未能确认当前线上 `creemConfigured` 状态。
- 继续支付验证：新增 `test/payment.test.js` 和 `npm test` 脚本。在符合项目要求的 Node v24 环境中，6 项支付边界测试全部通过，覆盖 webhook 正确/错误签名、匿名结账跳转、Creem 未配置拒绝以及订阅存储失败。
- 发现并修复 webhook 可靠性问题：此前 Supabase 未配置或订阅未写入时仍返回 HTTP 200，可能导致 Creem 不再重试但用户没有获得 Pro 权限；现改为 HTTP 503 并返回失败原因。
- 当前电脑默认 Node 为 v16.20.2，低于项目声明的 Node >=20；支付测试使用 Codex 工作区 Node v24.14.0 完成。
- 命令行、Vercel CLI 和内置浏览器访问线上服务均超时，因此仍未确认 Vercel 环境变量、真实测试 checkout、真实 Creem webhook、Supabase Pro 状态和取消/退款链路。
- 再次复测线上连接：内置浏览器访问 `https://voiceaichecker.com/api/health` 超时，系统 `nslookup voiceaichecker.com` 也无响应；问题发生在 DNS/网络连接阶段，尚未到达网站应用层，因此本轮仍无法判断线上支付配置状态。

## 2026-06-23

- 支付上线执行顺序：先复核并提交当前测试与 webhook 修复，再部署到 Vercel 测试/预览环境；随后配置 Creem、Supabase、Google 登录和应用域名环境变量；在 Creem 测试模式验证 checkout、webhook、Supabase 订阅写入、`/api/me` Pro 权限、配额、取消和退款；全部通过后再切生产配置。
- 当前禁止直接宣布支付可用：线上尚未验证，且本地修复与测试仍未提交和部署。
