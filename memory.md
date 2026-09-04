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
- 已为 8 个核心 SEO 页面补充有效 `FAQPage` JSON-LD：`index`、`free-ai-voice-detector`、`ai-audio-detector`、`deepfake-audio-detector`、`voice-clone-detector`、`ai-voice-checker`、`voice-ai-checker`、`is-this-voice-ai`。新增合规测试确保这些页面包含可解析的 FAQPage structured data 且至少 3 个问题；Node v24 执行测试共 9 项通过。
- 已为 8 个核心 SEO 页面补充可见面包屑和有效 `BreadcrumbList` JSON-LD；首页面包屑为 Home，其余落地页为 Home → 当前页。新增回归测试确保核心页同时具备可见 breadcrumb 和 BreadcrumbList structured data。Node v24 执行测试共 10 项通过，正文词数仍全部保持 600+。
- 已新增 `public/robots.txt` 和 `public/sitemap.xml`。sitemap 覆盖 12 个公开 HTML 页面：主页、7 个核心检测落地页、pricing、privacy、terms、refund-policy。新增 SEO 基础回归测试：检查公开 HTML 页 title、meta description、canonical、og:url、OG/Twitter、favicon、viewport；检查 robots 指向 sitemap，且 sitemap 包含所有公开 HTML canonical URL。Node v24 执行测试共 12 项通过。
- 已新增内链回归测试：自动枚举 `public/` 下所有 HTML 文件，确保全部被 SEO 页面清单覆盖；确保首页链接到 sitemap 中的每个公开 HTML URL；确保所有站内静态 `href` 都能解析到实际存在的 `public` 目标，动态 `/auth/`、`/api/` 和外链/邮件链接除外。Node v24 执行测试共 15 项通过。
- 用户反馈 Creem 审核已经通过。当前从 SEO/合规页面角度可以发布；但正式开放付费前仍建议完成一次真实端到端支付验收：Creem checkout、webhook、Supabase 订阅写入、`/api/me` Pro 权限、配额、取消订阅和退款/失败场景。

## 2026-06-30

- 用户反馈 Google Search Console 中 `/deepfake-audio-detector/`、`/voice-clone-detector/`、`/ai-audio-detector/`、`/ai-voice-checker/`、`/is-this-voice-ai/` 显示“已抓取 - 尚未编入索引”，判断主要风险是页面意图和模板结构过近、正文信息增量不足。
- 已按用户建议为上述 5 页分别补充独立的 `How it works`、`What we analyze`、`Limitations`、`Supported formats`、`Examples / Sample Cases` 和重写 FAQ，避免同一套模板只替换关键词。
- 严格按正文区域统计（排除 header/footer/script/style）词数：`deepfake-audio-detector` 约 1284，`voice-clone-detector` 约 1254，`ai-audio-detector` 约 1292，`ai-voice-checker` 约 1230，`is-this-voice-ai` 约 1265，均满足 1000-1500 词目标。
- 新增回归测试锁定这 5 个 SEO 落地页正文词数在 1000-1500 范围内；Node v24 执行 `--test test/*.test.js` 共 16 项通过。
- 发布后下一步建议：在 GSC 对这 5 个 URL 分别点击“请求编入索引”，然后观察 1-3 周，不要频繁反复提交；若仍未索引，再继续拉开搜索意图或增加真实示例、截图、对比表、使用教程等差异化内容。
- 用户反馈 GSC 报告多个页面发现 `https://voiceaichecker.com/cdn-cgi/l/email-protection` 和 `https://www.voiceaichecker.com/cdn-cgi/l/email-protection` 404。原因是 Cloudflare Email Address Obfuscation 会把公开 `mailto:` 邮箱链接改写成 `/cdn-cgi/l/email-protection`，Google 可能把该内部路径当链接抓取。
- 处理方式：移除公开 HTML 中的 `mailto:` 链接，改为拆分渲染的可见客服邮箱文本；首页 footer 的 Support 链接改为 `/#customer-support`；`robots.txt` 增加 `Disallow: /cdn-cgi/`。新增回归测试禁止公开 HTML 再出现 `mailto:` 或 `/cdn-cgi/l/email-protection`。Node v24 执行 `--test test/*.test.js` 共 17 项通过。
- 用户反馈本地已启动一个 Dify 实例，可通过 `localhost` 访问；登录邮箱为 `bingkung.zhao@gmail.com`。密码属于敏感信息，不写入仓库文件；后续如需自动登录，应从用户本次对话、临时输入或本地安全配置获取。
- 用户反馈 Dify 里已建好知识库，连接的 LLM 是 DeepSeek，API key 已在 Dify 中配置完成。API key 属于敏感信息，不写入仓库文件。
- 已查看 `/Users/zhaobingkun/Documents/副本案例讲解：保本预测.pptx`。PPT 共 24 页，主题是“保本预测 / 本量利分析模型”，结构为：核心分析模型、保本预测逻辑、Dify 工作流构建、Dify 应用指南。核心公式包括利润 =（单笔收入 - 单笔变动成本）×交易量 - 固定成本，保本交易量 = 固定成本 ÷ 单位边际贡献，目标销量 =（固定成本 + 目标利润）÷ 单位边际贡献，考虑 25% 所得税时需先把税后目标利润换算为税前利润。适合下一步转成 Dify 工作流：开始节点收集 `fixed_cost`、`unit_price`、`unit_variable_cost`、`current_volume`、`target_profit`；LLM 节点做成本结构分析；代码节点做 CVP 核心计算和压力测试；Agent/LLM 输出风险预警与经营建议。
- Dify 登录实际验证可用邮箱为 `bingkun.zhao@gmail.com`，不是上一条用户口述中的 `bingkung.zhao@gmail.com`。密码仍不写入仓库文件。
- 已在本地 Dify 创建并发布应用 `保本预测 CVP 工作流`，应用 ID 为 `9b7d526d-493e-45ea-aa0c-93242cfda1f7`，发布版本名为 `v1 保本预测 CVP`。
- 工作流节点：`输入经营数据` start 节点收集 `fixed_cost`、`unit_price`、`unit_variable_cost`、`current_volume`、`target_profit`、`tax_rate`；`CVP 核心计算` code 节点计算当前利润、单位边际贡献、保本交易量、目标销量、所得税影响、安全边际、压力测试和风险等级；`AI 经营建议` LLM 节点使用 DeepSeek `deepseek-chat` 输出中文 Markdown 经营报告；`输出保本预测报告` end 节点返回 `report`、`breakeven_volume`、`target_volume_after_tax`、`current_profit`、`risk_level`。
- 测试样例：固定成本 30000、单笔收入 30、单笔变动成本 10、当前交易量 800、目标税后利润 10000、所得税率 0.25。draft run 成功，输出保本交易量 1500，考虑所得税目标销量 2166.67，当前利润 -14000，风险等级 `高风险`。第一次用 `deepseek-v4-flash` 会输出 `<think>`，已改为 `deepseek-chat` 并在提示词中禁止思考过程，复测不再包含 `<think>`。
- 交付给其他 Dify 用户时，推荐导出应用 DSL 文件：在 Dify 工作室或应用编辑页通过更多菜单导出 DSL，然后把 `.yml` / `.yaml` 文件发给对方。对方在自己的 Dify 中选择导入 DSL 创建应用，并需要自行配置 DeepSeek provider/API key 和 `deepseek-chat` 模型；DSL 不应包含本地 API key、登录密码等敏感信息。本工作流当前未接知识库检索节点，因此交付重点是 DSL 文件和模型配置说明。
- 已在 `/Users/zhaobingkun/dev/dify-cvp-workflow-export/` 建立交付目录，并放入 Dify DSL 文件：`保本预测 CVP 工作流.yml` 与同内容英文文件名 `baoben-cvp-workflow-dify.yml`。两者均来自 `/Users/zhaobingkun/dev/dify/保本预测 CVP 工作流.yml`，内容校验为 Dify app DSL，包含 `kind: app`、`version: 0.6.0`、应用名和 `deepseek-chat` 模型引用；未检出 `api_key`、`password`、`secret` 字段。

## 2026-07-08

- 已按 JustSimple Tools 要求在 12 个公开 HTML 页面的 footer 加入目录 badge：`https://www.justsimple.tools` 链接使用 `target="_blank"` 和 `rel="noopener noreferrer"`，明确不包含 `nofollow`。
- 新增 `.directory-badge` footer 样式和回归测试，确保所有公开页面包含 JustSimple Tools badge 且 badge 链接 rel 不含 `nofollow`。
- 使用 Codex Node v24.14.0 执行 `node --test`，18 项测试全部通过；`git diff --check` 通过。

## 2026-07-10

- 根据首页 On Page SEO 体检报告优化 `public/index.html`：Title 改为 `AI Voice Detector Free Online | Voice AI Checker`，Meta Description 改为覆盖 voice notes、recordings、short clips 与 AI-generated/cloned/deepfake speech signals。
- 首页 H1 改为 `AI Voice Detector for Voice Clips`，首屏 summary 自然补入完整主关键词 `AI voice detector`；新增两段结果解读/使用场景正文，严格正文统计约 1220 词，进入 1200+ 建议区间。
- 修复首页图片宽高警告：brand favicon、登录头像、JustSimple Tools badge 均补充 width/height；JustSimple SVG 原始尺寸为 167x44，当前宽 150 时使用 `height="40"`。全站 footer badge 同步补 height，并更新回归测试。
- 验证：Codex Node v24.14.0 执行 `node --test` 共 18 项通过；`git diff --check` 通过。

## 2026-09-04

- 核查 Modulate 控制台 `platform.modulate.ai/dashboard/overview`：当前 Credit Balance 为 895.25，All-Time Credits Used 为 104.76，All-Time Hours 为 4.20；近 30 天使用模型为 `Velma-2 Synthetic Voice Detection Batch`。
- 控制台近期明细确认有两次 Server Error：显示时间 05:07:48，完成于 05:09:11，耗时 2.3s、消耗 0.02 credits；以及 12:30:06，完成于 12:31:21，耗时 16.3s、消耗 0.11 credits。两次错误均伴随同一提交时间的 Success 记录（无耗时/积分），更像请求已接收后处理阶段失败；这是基于控制台记录的推断。
- 当前余额充足，错误不像余额耗尽；控制台前端日志未发现额外 error/warn。Usage 明细页默认日期范围为 2026-08-05 至 2026-09-04，最近页面记录也只显示上述两次 Server Error；未执行 Retry 或其他外部修改。
- 按当前控制台明细估算：最近 24 小时约消耗 5.52 credits，最近 48 小时约 10.28 credits，折算约 5.1-5.5 credits/天，895.25 credits 约可支撑 162-174 天。近 30 天余额趋势约消耗 90 credits，长期平均约 3 credits/天，对应约 299 天；因近期调用量明显升高，预算应按约 170 天（约 5 个半月）看，不宜按 300 天乐观估计。
- 针对访问增长的代码检查：`src/server/handlers.js` 中的 `usage` 限额计数和 `cache` 均为进程内 Map，在 Vercel 多实例、冷启动场景下不共享；正式增长前应将配额计数迁移到具备原子自增的持久化存储，并给缓存增加 TTL/容量上限。`src/provider.js` 的 Modulate HTTPS 请求当前未设置明确超时，应补充超时、请求 ID、延迟和错误分类日志；不要对供应商失败无条件自动重试，以免重复扣费。
- 分析 GSC 导出（过滤器为 Web、过去 3 个月）：图表汇总 631 clicks、10,835 impressions、5.82% CTR，数据实际到 2026-09-01，存在约 2-3 天延迟。最近 7 天（8/26-9/1）245 clicks、3,110 impressions，相比前 7 天 clicks 增长约 70%、impressions 增长约 34%；最近 14 天 clicks 增长约 134%、impressions 增长约 93%，说明增长是连续趋势而非单日峰值。
- GSC 点击高度集中在首页：首页 596 clicks、9,110 impressions，占页面导出 clicks 的 93.4%；`/free-ai-voice-detector/` 有 1,308 impressions 但仅 12 clicks，`/voice-ai-checker/` 有 823 impressions但仅 17 clicks；`/ai-audio-detector/`、`/is-this-voice-ai/`、`/ai-voice-checker/`、`/deepfake-audio-detector/` 均已有首页外曝光但导出 clicks 为 0。优先把首页已验证的搜索意图和内链权重分配到这些落地页。
- 关键词机会集中在 `ai voice detector`（1,887 impressions、position 21.57）、`ai voice detector free`（668、24.12）、`free ai voice detector`（297、38.63）、`voice detector`（249、23.59）；已接近首页且表现较好的词包括 `free ai voice detector online`（position 7.8、CTR 17.67%）、`ai voice finder`（8.35、16.73%）、`ai voice checker`（9.17、8.64%）和 `voice ai detector`（9.02、20.37%）。
- 国家/地区以印度（176 clicks）、美国（71）、巴基斯坦（59）、孟加拉（46）、印度尼西亚（34）为主；美国有 2,308 impressions 但平均 position 37.06、CTR 3.08%，是排名提升机会。设备上移动端 CTR 9.12%、position 11.11，桌面端 impressions 6,759 但 CTR 3.85%、position 34.19，需分别检查移动体验和桌面端标题/摘要/内容匹配。
- 已实施访问增长第一批改造：`src/server/handlers.js` 支持 Supabase RPC 持久化配额，未配置 Supabase 时保留本地开发内存回退；匿名请求默认最多分析 15 秒，登录用户最多 30 秒；检测缓存增加 1 小时 TTL 和 1000 条上限；`src/provider.js` 增加 25 秒超时、X-Request-ID、响应耗时和上游错误日志，并将上游失败映射为 502/503/504；`.env.example` 已补充相关配置。部署前必须在 Supabase SQL Editor 执行 `supabase-schema.sql` 新增的 `daily_detection_usage` 表及两个 RPC 函数。
- 已根据 GSC 机会更新 6 个重点落地页的 Title、Meta、OG/Twitter 描述，并在首页补充指向 Deepfake Audio Detector 和 AI Audio Detector 的上下文内链；新增 `test/detection.test.js`。完整 Node v24 测试共 21 项通过，`git diff --check` 通过。当前未部署到 Vercel，也未执行 Supabase 外部迁移。
