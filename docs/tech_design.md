# VPS IP 封锁投票统计网站 — 技术方案文档

> 本文档为架构概览。各模块的详细设计见 `docs/modules/` 下的独立文档。

## 一、技术栈

| 层级 | 选型 |
|------|------|
| 框架 | Next.js 14 (App Router) — React 全栈，SSR/SSG/API Routes 一套代码 |
| 语言 | TypeScript |
| UI | Shadcn/ui + Tailwind CSS |
| 可视化 | ECharts (echarts-for-react) — 旭日图原生支持 |
| 表单 | React Hook Form + Zod |
| 状态管理 | Zustand |
| ORM | Prisma |
| 数据库 | PostgreSQL — 适合层级聚合查询 |
| 缓存 | Redis — 统计缓存、选项缓存、速率限制 |
| 任务队列 | BullMQ (基于 Redis) — 动态选项 AI 匹配串行化 |
| AI 服务 | Gemini API（自有中转站，OpenAI 兼容接口），Gemini Flash（选项匹配）+ Gemini Pro（报告生成） |
| IP 查询 | ip-api.com (主) / ipinfo.io (备) |
| 指纹 | FingerprintJS 开源版 |
| 部署 | Docker Compose（Next.js + PostgreSQL + Redis），外部 Nginx 反代 |

## 二、项目结构

```
/workspace/
├── prisma/
│   ├── schema.prisma            # 数据模型定义
│   ├── seed.ts                  # 预设数据初始化
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── page.tsx             # 首页：旭日图 + 投票入口
│   │   ├── vote/page.tsx        # 投票页面（多步表单）
│   │   ├── stats/page.tsx       # 统计详情页（表格/导出）
│   │   ├── report/page.tsx      # AI 分析报告页
│   │   └── api/
│   │       ├── vote/route.ts        # 提交投票
│   │       ├── ip-lookup/route.ts   # IP → 厂商/ASN
│   │       ├── stats/route.ts       # 聚合统计数据
│   │       ├── options/route.ts     # 选项列表
│   │       ├── export/route.ts      # Markdown 表格导出
│   │       └── report/route.ts      # AI 分析报告生成
│   ├── components/
│   │   ├── vote-form/           # 投票表单组件
│   │   ├── sunburst-chart/      # 旭日图组件
│   │   └── ui/                  # Shadcn/ui 组件
│   ├── lib/
│   │   ├── db.ts                # Prisma 客户端
│   │   ├── ai.ts                # OpenAI 兼容接口封装
│   │   ├── ip-lookup.ts         # IP 查询服务
│   │   ├── rate-limit.ts        # 速率限制
│   │   ├── queue.ts             # BullMQ 队列（含 Worker、孤儿恢复定时任务）
│   │   ├── vote-service.ts      # 投票业务逻辑（tryResolveVote 等）
│   │   ├── stats.ts             # 统计聚合逻辑
│   │   └── validators.ts        # Zod Schema（前后端共用）
│   ├── data/
│   │   └── presets.ts           # 预设选项数据
│   └── types/
│       └── index.ts             # 全局类型定义
├── docker/
│   ├── docker-compose.prod.yml  # 生产环境编排
│   └── Dockerfile.prod          # 生产环境镜像（多阶段构建）
└── .env.local                   # 环境变量
```

## 三、数据库 Schema

```prisma
model Vote {
  id          String   @id @default(cuid())
  isBlocked   Boolean                      // 是否被封
  org         String                       // 厂商
  asn         String                       // ASN
  usage       String                       // 用途：proxy / website
  protocol    String?                      // 代理协议（用途=网站时为 null）
  keyConfig   String?                      // 关键配置（用途=网站时为 null）
  count       Int      @default(1)         // 相同配置机器数量
  resolved    Boolean  @default(false)     // 是否参与统计（见 vote-flow.md）
  queueFailed Boolean  @default(false)     // 入队失败标记（见 dynamic-options.md）
  fingerprint String                       // 浏览器指纹
  createdAt   DateTime @default(now())

  @@index([resolved, isBlocked, org, asn, usage])
  @@index([resolved])
}

model DynamicOption {
  id          String   @id @default(cuid())
  layer       String                       // 所属层级：org/asn/protocol/keyConfig
  parentKey   String   @default("")        // 父级选项值（无父级时为 ""）
  value       String                       // 选项值
  isPreset    Boolean  @default(false)     // 是否为预设选项
  submitCount Int      @default(0)         // 不同用户提交次数（去重）
  promoted    Boolean  @default(false)     // 是否已升级为正式选项（≥3 不同用户）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  contributors OptionContributor[]

  @@unique([layer, value, parentKey])
  @@index([layer, promoted])
  @@index([layer, parentKey])
}

// parentKey 语义：
// - org 层：""（全局唯一）
// - asn 层：org 值（ASN 隶属特定厂商）
// - protocol 层：""（全局通用）
// - keyConfig 层：""（全局通用）

model OptionContributor {
  id          String   @id @default(cuid())
  optionId    String
  fingerprint String
  createdAt   DateTime @default(now())

  option      DynamicOption @relation(fields: [optionId], references: [id], onDelete: Cascade)

  @@unique([optionId, fingerprint])        // 同一用户对同一选项只计一次
}

model Report {
  id                     String   @id @default(cuid())
  content                String                        // Markdown 格式报告正文
  generatedAt            DateTime @default(now())
  totalVotesAtGeneration Int                           // 生成时的总投票数 SUM(count)
}
```

## 四、核心数据流

```
用户投票提交
  │
  ├─ 全部已知选项 → resolved=true → 直接参与统计
  │
  └─ 含自定义输入 → resolved=false → 入队 AI 匹配
        │
        ├─ 匹配已有选项 → 值归一化 + 去重计数
        └─ 全新选项 → 创建 DynamicOption(submitCount=1)
              │
              └─ submitCount ≥ 3 → promoted=true → 关联投票 resolve
```

## 五、关键设计决策

1. **SUM(count) 语义** — 所有数量统计使用 `SUM(count)` 而非 `COUNT(*)`，因为一条投票可代表多台机器
2. **用途=网站时** — `protocol` 和 `keyConfig` 在数据库存 `null`，展示层渲染为 `-`；旭日图中网站分支到"用途"层即为叶子节点
3. **选项列表 API** — `layer` 参数仅支持 `org/asn/protocol/keyConfig`；`isBlocked` 和 `usage` 为固定值，前端硬编码
4. **IP 查询不做预匹配** — ip-api.com 返回的原始值（如 `Vultr Holdings LLC`）直接填入输入框，不做名称映射，提交时走标准 AI 归类流程
5. **parentKey 使用空字符串** — 无父级时统一用 `""` 而非 `null`，避免 PostgreSQL 唯一约束对 NULL 的特殊处理
6. **AI 接口统一使用 OpenAI 兼容格式** — 通过 `openai` SDK 调用中转站，JSON 模式使用 `response_format: { type: "json_object" }`（非 Gemini 原生参数）。客户端初始化方式：
   ```typescript
   import OpenAI from "openai";
   const ai = new OpenAI({
     apiKey: process.env.AI_API_KEY,
     baseURL: process.env.AI_BASE_URL,
   });
   ```
7. **字段存储值与展示映射** — 统一在后端聚合时转换，前端直接使用展示值

| 字段 | 存储值 | 展示值 | 转换位置 |
|------|--------|--------|----------|
| isBlocked | `true` / `false` | 被封 / 未被封 | 后端聚合（stats/export） |
| usage | `"proxy"` / `"website"` | 代理 / 网站 | 后端聚合（stats/export） |
| protocol | `null`（用途=网站） | `-` | 后端聚合（export） + 前端渲染 |
| keyConfig | `null`（用途=网站） | `-` | 后端聚合（export） + 前端渲染 |

## 六、模块文档索引

| 模块 | 文档 | 职责 |
|------|------|------|
| 动态选项 | [modules/dynamic-options.md](modules/dynamic-options.md) | AI 匹配、队列串行化、选项升级、容错降级 |
| 投票流程 | [modules/vote-flow.md](modules/vote-flow.md) | 投票提交、resolved 状态管理、缓存策略 |
| 统计与导出 | [modules/stats-export.md](modules/stats-export.md) | 旭日图聚合、Markdown 导出、占比计算 |
| AI 报告 | [modules/ai-report.md](modules/ai-report.md) | 报告生成 Prompt、触发机制、过期提示 |
| 防刷与限流 | [modules/rate-limit.md](modules/rate-limit.md) | 指纹校验、速率限制、防伪措施 |
| 部署 | [modules/deployment.md](modules/deployment.md) | Docker 配置、环境变量、预设数据 Seed |

## 七、依赖版本参考

```json
{
  "next": "^14.2",
  "react": "^18.3",
  "typescript": "^5.4",
  "@prisma/client": "^5",
  "prisma": "^5",
  "echarts": "^5.5",
  "echarts-for-react": "^3.0",
  "zustand": "^4",
  "zod": "^3",
  "react-hook-form": "^7",
  "@hookform/resolvers": "^3",
  "bullmq": "^5",
  "ioredis": "^5",
  "openai": "^4",
  "@fingerprintjs/fingerprintjs": "^4",
  "tailwindcss": "^3.4"
}
```

## 八、Zod 验证 Schema

前后端共用，定义在 `src/lib/validators.ts`：

```typescript
import { z } from "zod";

export const voteSchema = z.object({
  isBlocked: z.boolean(),
  org: z.string().min(1).max(100),
  asn: z.string().regex(/^AS\d+$/, "ASN 格式需为 AS + 数字"),
  usage: z.enum(["proxy", "website"]),
  protocol: z.string().min(1).max(100).nullable(),
  keyConfig: z.string().min(1).max(100).nullable(),
  count: z.number().int().min(1).max(100).default(1),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
}).refine(
  (data) => {
    if (data.usage === "proxy") return !!data.protocol && !!data.keyConfig;
    if (data.usage === "website") return data.protocol === null && data.keyConfig === null;
    return false;
  },
  { message: "usage=proxy 时 protocol/keyConfig 必填；usage=website 时必须为 null" }
);

export const ipLookupSchema = z.object({
  ip: z.string().ip(),
});
```

## 九、开发约定

| 约定 | 说明 |
|------|------|
| API 响应 | 统一使用 `NextResponse.json()` 返回，错误格式 `{ "error": "描述" }` |
| Prisma 客户端 | 全局单例，从 `src/lib/db.ts` 导入 |
| Redis 客户端 | 全局单例，从 `src/lib/db.ts` 或独立文件导入，使用 `ioredis` |
| AI 客户端 | 全局单例，从 `src/lib/ai.ts` 导入，使用 `openai` SDK |
| 环境变量 | 通过 `process.env` 直接读取，无需额外封装 |
| 业务逻辑复用 | `tryResolveVote` 等跨模块逻辑集中在 `src/lib/vote-service.ts` |
| 展示值转换 | `isBlocked`/`usage` 在后端聚合时转换；`protocol`/`keyConfig` 的 null→"-" 在后端导出和前端渲染时均需处理 |
