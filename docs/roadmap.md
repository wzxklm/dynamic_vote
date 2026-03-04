# VPS IP 封锁投票统计网站 — 实施路线

> **使用方式：** 每个阶段对应一次 Claude Code 会话。启动新会话时发送 `请执行阶段 N`，Claude Code 将读取本文件对应章节 + CLAUDE.md 恢复上下文，然后阅读参考文档开始工作。

> **运行环境：** Claude Code 运行在 devcontainer 内（`.devcontainer/docker-compose.yml`）。PostgreSQL 和 Redis 作为 sidecar 服务已随容器启动，通过内部网络访问（`postgres:5432`、`redis:6379`）。环境变量 `DATABASE_URL` 和 `REDIS_URL` 已由容器注入。容器内无 Docker daemon，不可执行 `docker` / `docker compose` 命令。端口 3000 已映射到宿主机，可通过宿主机浏览器访问开发服务器。

---

## 阶段〇：文档通读 → 生成 CLAUDE.md + 权限配置

> `请执行阶段〇`

**任务：** 通读 docs/ 下全部文档，生成 CLAUDE.md（含项目状态、技术栈、关键约束、文档索引），初始化 `.claude/settings.json` 权限配置，配置 `.gitignore`（排除 `node_modules/`、`.env.local`、`.next/`、`prisma/*.db` 等敏感文件和构建产物）。

**参考文档：** 全部 docs/

**CLAUDE.md 必须包含的关键约束：**
- 数量统计用 SUM(count) 而非 COUNT(*)
- parentKey 无父级时用空字符串 ""，不用 null
- usage=website 时 protocol/keyConfig 存 null，展示 "-"
- isBlocked 存 boolean，展示 "被封"/"未被封"
- usage 存 "proxy"/"website"，展示 "代理"/"网站"
- AI 接口用 openai SDK + response_format: { type: "json_object" }
- IP 查询结果不做名称映射，原始值直接填入，提交时走 AI 归类
- 选项列表 API 的 layer 仅支持 org/asn/protocol/keyConfig

**完成标志：** CLAUDE.md 存在且包含所有关键约束，`.claude/settings.json` 就绪，`.gitignore` 已配置（至少排除 `.env.local`、`node_modules/`、`.next/`），git 有初始 commit。

---

## 阶段一：项目脚手架与数据层

> `请执行阶段一`

**参考文档：** `tech_design.md`（二、三、七、八、九）、`modules/deployment.md`

**任务：**
1. 项目初始化（Next.js 14 + Shadcn/ui + 全部依赖）
2. ~~启动开发环境~~ ✓ 已由 devcontainer 提供（PostgreSQL + Redis 作为 sidecar 服务随容器启动）
3. 生成 Prisma Schema、Zod validators、TypeScript 类型、预设数据、环境变量（`.env.local` 需包含 `deployment.md` 中列出的全部变量，AI 相关变量值留空占位）、全局单例
4. prisma generate + db push + seed
5. 生成 Docker 生产配置（留待阶段六使用）

**注意：** /workspace/ 为非空目录，create-next-app 可能失败，需准备手动初始化方案。

**完成标志：** `npx tsc --noEmit` 通过，seed 数据存在，Zod 校验正确。

---

## 阶段二：投票核心流程

> `请执行阶段二`

**参考文档：** `modules/vote-flow.md`、`api.md` 一二三、`modules/rate-limit.md`、`modules/dynamic-options.md` 二

**任务：**
1. 后端 lib：rate-limit、ip-lookup、vote-service
2. API 路由：/api/options、/api/ip-lookup、/api/vote
3. 前端投票表单（8 步向导）+ FingerprintJS 集成

**完成标志：** 投票 API curl 测试通过（预设选项 resolved=true），前端表单可渲染。

---

## 阶段三：动态选项与 AI 匹配队列

> `请执行阶段三`

**前置条件：** 开始编码前，先询问用户获取 AI 相关环境变量的值（`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL_LIGHT`、`AI_MODEL_FULL`），填入 `.env.local` 对应位置。

**参考文档：** `modules/dynamic-options.md`（全文）、`modules/ai-report.md` 三（匹配 Prompt）

**任务：**
1. 扩展 ai.ts 添加 matchOption()
2. 创建 queue.ts（BullMQ 队列 + Worker + 孤儿恢复）
3. 扩展 vote-service.ts（去重计数、选项升级、批量 resolve）
4. 扩展 vote API（入队失败重试 + queueFailed）
5. 容错降级逻辑
6. 选项缓存清除

**注意：** 本阶段逻辑高度耦合，应串行实现，不宜并行拆分。

**完成标志：** 自定义选项投票 → resolved=false → 队列中可查到任务。

---

## 阶段四：统计可视化与数据导出

> `请执行阶段四`

**参考文档：** `modules/stats-export.md`、`api.md` 四五

**任务：**
1. 后端：stats.ts 聚合逻辑 + /api/stats + /api/export 路由
2. 前端：ECharts 旭日图组件、首页、统计页

**完成标志：** /api/stats 返回树形数据，/api/export 返回 Markdown 表格，`npm run build` 通过。

---

## 阶段五：AI 分析报告

> `请执行阶段五`

**参考文档：** `modules/ai-report.md`（全文）、`api.md` 六

**任务：**
1. /api/report 路由（POST 生成 + GET 获取）
2. 报告页面（生成按钮 + Markdown 渲染 + 过期提示）

**完成标志：** GET /api/report 无报告时 404，POST 生成后 GET 返回报告内容。（需 AI API 可用，否则仅验证 404 逻辑和代码编译通过）

---

## 阶段六：UI 完善与部署验收

> `请执行阶段六`

**参考文档：** `modules/deployment.md`、`modules/rate-limit.md` 三

**任务（Claude Code）：**
1. UI 完善：响应式适配、深色模式、加载状态与骨架屏、指纹防伪强化
2. 确保 Docker 生产配置文件正确（阶段一已生成，此处复查）

**任务（用户手动）：**
3. Docker 生产构建验证（`docker compose up`）
4. 端到端验收

**验收清单（用户手动）：**
- [ ] docker compose up 三服务全部 healthy
- [ ] seed 数据导入成功
- [ ] 预设选项投票 → resolved=true → 旭日图展示
- [ ] 自定义选项投票 → resolved=false → 队列处理
- [ ] 选项升级流程正常
- [ ] 旭日图钻取 + tooltip 正常
- [ ] Markdown 导出格式正确
- [ ] AI 报告生成成功
- [ ] 限流触发 429
- [ ] 移动端 + 深色模式正常

**完成标志：** Claude Code 完成 UI 完善 + 配置复查，用户手动完成部署验收后，更新 CLAUDE.md 为"全部完成"。

---

## 每阶段完成后必做

1. `npx tsc --noEmit`
2. `git add -A && git commit`
3. 更新 CLAUDE.md 的阶段状态
