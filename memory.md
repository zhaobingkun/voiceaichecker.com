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
- Creem 复审反馈要求公开 AI 检测服务商或模型。已在首页、隐私政策、条款和价格页明确披露：在线检测由 Modulate 的 Velma-2 Synthetic Voice Detection API 提供；Mock 结果仅为演示模式。
- 新增合规回归测试，连同支付测试共 7 项通过。修改与此前 webhook 可靠性修复已提交为 `1d0ff85` 并推送到 `main`；生产隐私页已确认显示 2026-06-23 更新日期、Modulate 和 Velma-2 文案。
- Creem 官方清单还要求可用的品牌支持邮箱，以及用户能从产品内直接取消订阅（Cancel Subscription API 或 Creem Customer Portal）。当前网站只公开 Gmail，`voiceaichecker.com` 查询不到 MX 记录；项目也没有取消/Portal 入口。这两个问题解决前不应点击 Request re-review。
- Creem 复审入口：Live mode 下进入 `Balance → Payout Account`，点击 `Request re-review`。提交该外部动作前需确认网站已部署、品牌邮箱可收件、取消入口可用。
- 用户决定继续使用 `bingkun.zhao@gmail.com` 作为公开客服邮箱。该地址已用于价格、隐私、条款和退款页面，并补充到首页 Customer Support 区块与页脚；需注意 Creem 清单偏好品牌域名邮箱，因此复审仍存在被要求改为域名邮箱的风险。
- 品牌客服邮箱建议使用 `support@voiceaichecker.com`。免费方案可先用 Cloudflare Email Routing 做收信转发到 Gmail，但它不是完整发信邮箱；如需完整收发和更高审核可信度，可选 Zoho Mail、Google Workspace 或 Microsoft 365，并按服务商要求配置域名 MX/SPF/DKIM/DMARC。

## 2026-06-29

- 按 `/Users/zhaobingkun/doc/SEO-SITE-PLAYBOOK.md` 优化文案，重点减少首页和核心落地页的模板化 AI 味：补充真实使用场景、取样建议、误判边界、结果解读和下一步验证动作。
- 首页正文有效词数约 1100，符合手册中首页至少 600-800 词、必要时可扩到 1200-1800 词的要求；`/free-ai-voice-detector/` 有效正文约 640 词，其他长尾页约 370-510 词，后续如继续做 SEO 可逐步补到 600+。
- 修改覆盖 `public/index.html`、`public/free-ai-voice-detector/index.html`、`public/ai-audio-detector/index.html`、`public/deepfake-audio-detector/index.html`、`public/voice-clone-detector/index.html`、`public/ai-voice-checker/index.html`、`public/voice-ai-checker/index.html`、`public/is-this-voice-ai/index.html`。
- 验证：`git diff --check` 通过；Node v24 执行 `--test test/*.test.js` 共 8 项通过。Creem 要求的 Modulate / Velma-2 披露和 Gmail 客服邮箱仍保留。
- 继续加厚核心落地页后，严格按正文区域统计（排除 header/footer/script/style）词数：`index` 约 1101，`free-ai-voice-detector` 约 640，`ai-audio-detector` 约 627，`deepfake-audio-detector` 约 602，`voice-clone-detector` 约 611，`ai-voice-checker` 约 600，`voice-ai-checker` 约 640，`is-this-voice-ai` 约 601。8 个核心 SEO 页面均达到 600+ 正文词量。
