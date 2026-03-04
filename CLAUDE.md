# VPS IP 封锁投票统计网站

## 项目状态

| 阶段 | 状态 |
|------|------|
| 阶段〇：文档通读 + CLAUDE.md + 权限配置 | ✅ 完成 |
| 阶段一：项目脚手架与数据层 | ⬚ 未开始 |
| 阶段二：投票核心流程 | ⬚ 未开始 |
| 阶段三：动态选项与 AI 匹配队列 | ⬚ 未开始 |
| 阶段四：统计可视化与数据导出 | ⬚ 未开始 |
| 阶段五：AI 分析报告 | ⬚ 未开始 |
| 阶段六：UI 完善与部署验收 | ⬚ 未开始 |

## 技术栈

- **框架**: Next.js 14 (App Router), TypeScript
- **UI**: Shadcn/ui + Tailwind CSS
- **可视化**: ECharts (echarts-for-react) — 旭日图
- **表单**: React Hook Form + Zod
- **状态管理**: Zustand
- **ORM**: Prisma + PostgreSQL
- **缓存/队列**: Redis + BullMQ (ioredis)
- **AI**: OpenAI SDK (兼容中转站, Gemini 模型)
- **IP 查询**: ip-api.com (主) / ipinfo.io (备)
- **指纹**: FingerprintJS 开源版
- **部署**: Docker Compose (Next.js + PostgreSQL + Redis)

## 运行环境

- DevContainer 内运行，PostgreSQL (`postgres:5432`) 和 Redis (`redis:6379`) 作为 sidecar 已启动
- 环境变量 `DATABASE_URL` 和 `REDIS_URL` 由容器注入
- 容器内无 Docker daemon，不可执行 docker 命令
- 端口 3000 映射到宿主机

## 关键约束（必须严格遵守）

1. **数量统计用 SUM(count) 而非 COUNT(\*)**  — 一条投票可代表多台机器
2. **parentKey 无父级时用空字符串 ""，不用 null** — 避免 PostgreSQL 唯一约束对 NULL 的特殊处理
3. **usage=website 时 protocol/keyConfig 存 null，展示 "-"** — 数据库存 null，前端/导出渲染为 "-"
4. **isBlocked 存 boolean，展示 "被封"/"未被封"** — 后端聚合时转换
5. **usage 存 "proxy"/"website"，展示 "代理"/"网站"** — 后端聚合时转换
6. **AI 接口用 openai SDK + response_format: { type: "json_object" }** — 非 Gemini 原生参数
7. **IP 查询结果不做名称映射，原始值直接填入，提交时走 AI 归类**
8. **选项列表 API 的 layer 仅支持 org/asn/protocol/keyConfig** — isBlocked 和 usage 前端硬编码

## 项目结构

```
/workspace/
├── prisma/                    # Schema + seed + migrations
├── src/
│   ├── app/
│   │   ├── page.tsx           # 首页：旭日图 + 投票入口
│   │   ├── vote/page.tsx      # 投票页（多步表单）
│   │   ├── stats/page.tsx     # 统计详情页
│   │   ├── report/page.tsx    # AI 分析报告页
│   │   └── api/               # vote, ip-lookup, stats, options, export, report
│   ├── components/            # vote-form, sunburst-chart, ui (Shadcn)
│   ├── lib/                   # db, ai, ip-lookup, rate-limit, queue, vote-service, stats, validators
│   ├── data/presets.ts        # 预设选项数据
│   └── types/index.ts         # 全局类型
├── docker/                    # Dockerfile.prod + docker-compose.prod.yml
└── .env.local                 # 环境变量
```

## 开发约定

- API 响应统一 `NextResponse.json()`，错误格式 `{ "error": "描述" }`
- Prisma/Redis/AI 客户端均为全局单例
- 业务逻辑复用集中在 `src/lib/vote-service.ts`
- Zod Schema 前后端共用 (`src/lib/validators.ts`)
- 环境变量通过 `process.env` 直接读取

## 文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| 需求文档 | `docs/requirements.md` | 数据模型、预设选项、动态选项机制、可视化、投票流程 |
| 技术方案 | `docs/tech_design.md` | 技术栈、项目结构、Schema、Zod、依赖版本、开发约定 |
| 接口文档 | `docs/api.md` | 全部 API 定义（vote, ip-lookup, options, stats, export, report） |
| 实施路线 | `docs/roadmap.md` | 6 个阶段的任务清单和完成标志 |
| 投票流程 | `docs/modules/vote-flow.md` | 投票提交、resolved 状态管理、前端交互规范 |
| 动态选项 | `docs/modules/dynamic-options.md` | AI 匹配、BullMQ 队列、选项升级、容错降级 |
| 统计导出 | `docs/modules/stats-export.md` | 旭日图聚合、Markdown 导出、占比计算 |
| AI 报告 | `docs/modules/ai-report.md` | 报告 Prompt、触发机制、过期提示 |
| 防刷限流 | `docs/modules/rate-limit.md` | 指纹校验、滑动窗口限流、防伪措施 |
| 部署 | `docs/modules/deployment.md` | Docker 配置、环境变量、Seed 脚本 |
