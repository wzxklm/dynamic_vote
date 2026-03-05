# VPS IP 封锁投票统计网站 — 接口文档

## 概述

- 基础路径：`/api`
- 数据格式：JSON
- 错误响应统一格式：`{ "error": "错误描述" }`

**字段命名映射：** 需求文档使用下划线命名（`proxy_protocol`、`key_config`），API 和数据库统一使用 camelCase（`protocol`、`keyConfig`），对应关系如下：

| 需求文档 | API / Schema |
|----------|-------------|
| `proxy_protocol` | `protocol` |
| `key_config` | `keyConfig` |
| `is_blocked` | `isBlocked` |

---

## 一、投票相关

### POST /api/vote

提交一条投票记录。

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| isBlocked | boolean | 是 | 是否被封 |
| org | string | 是 | 厂商名称 |
| asn | string | 是 | AS 号码 |
| usage | string | 是 | 用途：`"proxy"` / `"website"` |
| protocol | string \| null | usage=proxy 时必填，usage=website 时必须传 `null` | 代理协议 |
| keyConfig | string \| null | usage=proxy 时必填，usage=website 时必须传 `null` | 关键配置 |
| count | number | 否 | 相同配置机器数量，默认 1，范围 1-100 |
| fingerprint | string | 是 | 浏览器指纹 |

**请求示例：**

```json
{
  "isBlocked": true,
  "org": "搬瓦工 (IT7)",
  "asn": "AS25820",
  "usage": "proxy",
  "protocol": "Shadowsocks",
  "keyConfig": "直连无伪装",
  "count": 2,
  "fingerprint": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**成功响应：** `201 Created`

```json
{
  "id": "clxxx...",
  "resolved": true
}
```

**说明：**
- `resolved = true` 表示全部选择了预设/已升级选项，投票立即参与统计
- `resolved = false` 表示含自定义输入，等待 AI 处理后决定

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 400 | 参数校验失败 |
| 429 | 投票频率超限 |

---

## 二、IP 查询

### GET /api/ip-lookup?ip={ip}

根据 IP 地址查询厂商和 ASN 信息。

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ip | string | 是 | IPv4 或 IPv6 地址 |

**成功响应：** `200 OK`

```json
{
  "org": "Vultr Holdings LLC",
  "asn": "AS20473",
  "country": "US",
  "city": "Los Angeles"
}
```

**说明：** IP 不存库，仅用于实时查询。结果短期缓存在 Redis 中。

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 400 | IP 格式无效 |
| 429 | IP 查询频率超限 |
| 502 | 上游 IP 查询服务不可用 |

---

## 三、选项列表

### GET /api/options?layer={layer}&parentKey={parentKey}

获取指定层级的可选项列表（预设选项 + 已升级的自定义选项）。

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| layer | string | 是 | 层级：`"org"` / `"asn"` / `"protocol"` / `"keyConfig"`（注：`isBlocked` 和 `usage` 为固定选项，前端硬编码，不通过此接口查询） |
| parentKey | string | 部分层级需要 | 父级选项值（查询 ASN 时必传 org 值；其他层级不传） |

**成功响应：** `200 OK`

```json
{
  "layer": "org",
  "options": [
    { "id": "clxxx1", "value": "Vultr", "isPreset": true, "promoted": true },
    { "id": "clxxx2", "value": "搬瓦工 (IT7)", "isPreset": true, "promoted": true },
    { "id": "clxxx3", "value": "CloudSigma", "isPreset": false, "promoted": true }
  ]
}
```

**说明：** 返回结果按名称排序，仅包含可用选项（`isPreset = true` 或 `promoted = true`）。每个选项同时返回 `isPreset` 和 `promoted` 字段。

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 400 | layer 参数无效 |

---

## 四、统计数据

### GET /api/stats

获取旭日图所需的聚合统计数据。

**查询参数：** 无

**成功响应：** `200 OK`

```json
{
  "total": 1000,
  "updatedAt": "2025-01-15T10:30:00Z",
  "tree": {
    "name": "root",
    "children": [
      {
        "name": "被封",
        "value": 600,
        "children": [
          {
            "name": "搬瓦工 (IT7)",
            "value": 150,
            "children": [
              {
                "name": "AS25820",
                "value": 150,
                "children": [
                  {
                    "name": "代理",
                    "value": 120,
                    "children": [
                      {
                        "name": "Shadowsocks",
                        "value": 35,
                        "children": [
                          { "name": "直连无伪装", "value": 20 },
                          { "name": "机场节点", "value": 15 }
                        ]
                      }
                    ]
                  },
                  { "name": "网站", "value": 30 }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "未被封",
        "value": 400,
        "children": []
      }
    ]
  }
}
```

**说明：**
- 数据来自 Redis 缓存（TTL = 2 分钟），过期后从数据库重新聚合
- 只统计 `resolved = true` 的投票
- `updatedAt` 表示缓存生成时间，前端可展示"数据更新于 X 分钟前"
- 叶子节点不包含 `children` 字段；非叶子节点的 `children` 为数组（可能为空）

---

## 五、数据导出

### GET /api/export

导出 Markdown 格式的扁平统计表格。

**查询参数：** 无

**成功响应：** `200 OK`，`Content-Type: text/markdown`

```markdown
总投票数: 1000 台

| 是否被封 | 厂商 | ASN | 用途 | 协议 | 关键配置 | 数量 | 占总比 |
|----------|------|-----|------|------|----------|------|--------|
| 被封 | 搬瓦工 | AS25820 | 代理 | Shadowsocks | 直连无伪装 | 20 | 2.0% |
| 被封 | 搬瓦工 | AS25820 | 代理 | VMess+WS+TLS | CF CDN中转 | 25 | 2.5% |
| 未被封 | Vultr | AS20473 | 网站 | - | - | 30 | 3.0% |
| 未被封 | Vultr | AS20473 | 代理 | VLESS+Reality | TLS伪装Chrome | 18 | 1.8% |
```

**说明：** 按层级从左到右排序，同层内按数量降序。

---

## 六、AI 分析报告

### POST /api/report

触发生成 AI 分析报告。

**请求参数：** 无

**成功响应：** `200 OK`

```json
{
  "report": "## 封锁分析报告\n\n### 1. 封锁率最高的组合...",
  "generatedAt": "2025-01-15T12:00:00Z",
  "totalVotesAtGeneration": 1000
}
```

**说明：**
- 生成过程可能耗时较长（依赖 AI 接口），前端应展示加载状态
- 报告缓存到数据库，重复请求会重新生成并替换旧报告

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 429 | 报告生成频率超限 |
| 502 | AI 服务不可用或响应异常 |
| 504 | AI 服务响应超时 |

### GET /api/report

获取已缓存的 AI 分析报告。

**成功响应：** `200 OK`

```json
{
  "report": "## 封锁分析报告\n\n### 1. 封锁率最高的组合...",
  "generatedAt": "2025-01-15T12:00:00Z",
  "totalVotesAtGeneration": 1000,
  "currentTotalVotes": 1042
}
```

**说明：** 前端可对比 `totalVotesAtGeneration` 和 `currentTotalVotes` 展示过期提示。

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 404 | 尚未生成过报告 |

---

## 七、速率限制

所有接口共享以下限流规则：

| 接口 | 限制 | 维度 |
|------|------|------|
| POST /api/vote | 10 次/小时（同设备）；30 次/小时（同 IP） | IP + 浏览器指纹；IP |
| GET /api/ip-lookup | 40 次/分钟 | 全局（受上游 ip-api.com 45次/分钟限制） |
| POST /api/report | 3 次/小时 | IP |

超限时返回 `429 Too Many Requests`：

```json
{
  "error": "请求过于频繁，请稍后再试",
  "retryAfter": 60
}
```
