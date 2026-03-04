# VPS IP 封锁投票统计

一个用于统计 VPS IP 封锁情况的投票网站。用户提交自己的 VPS 使用信息（厂商、ASN、协议、配置等），系统汇总数据并通过可视化图表和 AI 分析报告展示统计结果。

## 功能

- **投票提交** — 多步表单收集 VPS 封锁信息，支持 IP 自动查询厂商/ASN
- **动态选项** — 用户可输入自定义选项，AI 自动匹配/归类，高频选项自动升级为正式选项
- **统计可视化** — ECharts 旭日图展示多维度封锁数据，支持按厂商/ASN/协议等层级下钻
- **数据导出** — Markdown 格式的统计表格导出
- **AI 分析报告** — 基于投票数据生成封锁趋势分析报告
- **防刷机制** — FingerprintJS 指纹 + 滑动窗口限流

## 技术栈

Next.js 14 (App Router) · TypeScript · Shadcn/ui · Tailwind CSS · ECharts · Prisma · PostgreSQL · Redis · BullMQ · OpenAI SDK

## 部署指南

### 前置要求

- Docker 和 Docker Compose（v2）
- 一个 OpenAI 兼容的 AI API（用于动态选项匹配和报告生成）

### 1. 克隆仓库

```bash
git clone https://github.com/wzxklm/dynamic_vote.git
cd dynamic_vote
```

### 2. 配置环境变量

```bash
cp .env.example docker/.env
```

编辑 `docker/.env`，至少填写以下必填项：

| 变量 | 说明 | 必填 |
|------|------|:----:|
| `DB_PASSWORD` | PostgreSQL 密码 | ✅ |
| `AI_BASE_URL` | AI API 地址（OpenAI 兼容） | ✅ |
| `AI_API_KEY` | AI API 密钥 | ✅ |
| `AI_MODEL_LIGHT` | 轻量模型（默认 `gemini-flash`） | |
| `AI_MODEL_FULL` | 完整模型（默认 `gemini-pro`） | |
| `NEXT_PUBLIC_SITE_URL` | 站点公开 URL（默认 `http://localhost:3000`） | |

完整变量说明见 [.env.example](.env.example)。

### 3. 启动服务

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d --build
```

首次构建需要几分钟。启动后：
- app 容器会自动执行 `prisma migrate deploy` 创建数据库表
- PostgreSQL 和 Redis 通过 healthcheck 确保就绪后 app 才启动

### 4. 初始化预设数据

首次部署需要导入预设选项（厂商、ASN、协议等）：

```bash
docker compose -f docker-compose.prod.yml exec app npx prisma db seed
```

### 5. 验证

访问 `http://your-server-ip:3000`，应看到首页旭日图和投票入口。

### Nginx 反向代理（可选）

如需域名和 HTTPS，配置 Nginx 反向代理到 `localhost:3000`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 常用运维命令

```bash
cd docker

# 查看日志
docker compose -f docker-compose.prod.yml logs -f app

# 重启服务
docker compose -f docker-compose.prod.yml restart app

# 停止所有服务
docker compose -f docker-compose.prod.yml down

# 停止并清除数据（⚠️ 会删除数据库和 Redis 数据）
docker compose -f docker-compose.prod.yml down -v

# 更新部署（拉取最新代码后）
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 本地开发

```bash
# 安装依赖
npm install

# 需要 PostgreSQL 和 Redis 服务可用，配置 .env.local
npx prisma db push
npx prisma db seed
npm run dev
```

## 项目文档

详细的需求、技术方案和接口文档在 [docs/](docs/) 目录下。

## License

MIT
