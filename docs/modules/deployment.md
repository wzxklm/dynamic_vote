# 部署模块

> Docker 部署、环境变量、预设数据初始化。涉及文件：`docker/`、`prisma/seed.ts`、`src/data/presets.ts`

## 一、Docker 架构

三个服务通过 Docker Compose 编排：

| 服务 | 镜像 | 说明 |
|------|------|------|
| app | 多阶段构建的 Next.js 镜像 | standalone 模式输出，启动时自动执行 `prisma migrate deploy` |
| postgres | postgres:16-alpine | 数据持久化到 volume |
| redis | redis:7-alpine | 开启 AOF 持久化 |

- app 端口 3000 映射到宿主机，由外部 Nginx 反向代理
- Nginx 由用户自行配置（域名、HTTPS），项目不涉及
- postgres 和 redis 使用 healthcheck，app 依赖它们 healthy 后启动

### Dockerfile 要点

- 多阶段构建：deps → builder → runner
- deps 阶段 `npm ci`（安装全量依赖，builder 需要 TypeScript、Prisma CLI 等 devDependencies）
- builder 阶段执行 `prisma generate` + `npm run build`
- runner 阶段仅复制 standalone 输出 + static 文件 + prisma 目录 + `node_modules`（仅生产依赖，通过 `npm prune --omit=dev` 或重新 `npm ci --omit=dev` 获取）

## 二、环境变量

```env
# 数据库
DATABASE_URL=postgresql://user:password@postgres:5432/vps_vote?schema=public

# Redis
REDIS_URL=redis://redis:6379

# AI 服务（OpenAI 兼容中转站，使用 Gemini 模型）
AI_BASE_URL=https://your-relay.example.com/v1
AI_API_KEY=sk-xxx
AI_MODEL_LIGHT=gemini-flash        # 动态选项匹配（轻量快速）
AI_MODEL_FULL=gemini-pro           # 分析报告生成（完整能力）

# IP 查询
IP_API_PRIMARY=http://ip-api.com/json
IP_API_FALLBACK=https://ipinfo.io
IP_API_FALLBACK_TOKEN=              # ipinfo.io Token（可选）

# 速率限制
RATE_LIMIT_VOTE_PER_HOUR=10
RATE_LIMIT_IP_LOOKUP_PER_MINUTE=40
RATE_LIMIT_REPORT_PER_HOUR=3

# 应用
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## 三、预设数据 Seed

### 数据结构

预设选项定义在 `src/data/presets.ts`，格式为 `{ layer, value, parentKey }` 数组。

包含的预设层级：
- **org（厂商）** — Vultr、Hostinger、OVH、DigitalOcean、Linode、AWS、Azure、GCP、阿里云、腾讯云、搬瓦工、RackNerd、DMIT、CloudCone
- **asn** — 每个预设厂商对应一个主要 ASN，parentKey 为厂商名称
- **protocol（协议）** — Shadowsocks 系列、VMess 系列、VLESS 系列、Trojan 系列、QUIC/UDP、VPN、伪装/混淆类等共 30+ 个
- **keyConfig（关键配置）** — TLS 伪装、CDN 中转、端口策略、连接方式、使用人数等

### Seed 逻辑

- 使用 `prisma.dynamicOption.upsert`，按 `@@unique([layer, value, parentKey])` 去重
- 预设选项写入时 `isPreset=true, promoted=true`（预设视为已升级，直接可用）
- 已存在则不修改（update 为空）
- 在 `package.json` 的 `prisma.seed` 配置中注册

### 启动命令

```bash
# 首次部署
cd docker
DB_PASSWORD=your_secure_password docker compose -f docker-compose.prod.yml up -d

# 初始化预设数据（首次部署后执行一次）
docker compose -f docker-compose.prod.yml exec app npx prisma db seed
```
