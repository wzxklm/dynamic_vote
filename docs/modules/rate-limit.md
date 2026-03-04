# 防刷票与速率限制模块

> 指纹校验、速率限制、防伪措施。涉及文件：`src/lib/rate-limit.ts`、`src/lib/fingerprint.ts`（前端）

## 一、速率限制

基于 Redis **滑动窗口**实现（sorted set：score=时间戳）。

| 接口 | 维度 | 阈值 | 窗口期 | 说明 |
|------|------|------|--------|------|
| `POST /api/vote` | IP + fingerprint | 10 次 | 1 小时 | 同一设备每小时最多投 10 次 |
| `POST /api/vote` | IP | 30 次 | 1 小时 | 同一 IP 每小时最多 30 次 |
| `GET /api/ip-lookup` | 全局 | 40 次 | 1 分钟 | ip-api.com 限制 45次/分钟，预留余量 |
| `POST /api/report` | IP | 3 次 | 1 小时 | 报告生成成本高 |

Redis key 格式：`ratelimit:{type}:{identifier}`，TTL 与窗口期一致。

## 二、FingerprintJS 集成

- 使用开源版 `@fingerprintjs/fingerprintjs`（非 Pro 付费版）
- 前端初始化后调用 `fp.get()` 获取 `visitorId`（32 位十六进制字符串）
- 同一浏览器 + 设备的 visitorId 高度稳定
- 前端做单例缓存，避免重复初始化

## 三、指纹防伪措施

浏览器指纹在前端生成，存在伪造风险。后端增加辅助校验：

1. **格式校验** — 检查是否为 32 位十六进制字符串（`/^[a-f0-9]{32}$/`）
2. **指纹-IP 绑定** — 同一指纹 24 小时内只允许有限数量的不同 IP（防同一伪造指纹被多 IP 复用）
3. **IP-指纹数量限制** — 单 IP 时间窗口内的不同指纹数设上限（防同一 IP 批量生成指纹）
4. **请求特征检测** — 检查 User-Agent、Accept-Language 等头部是否符合正常浏览器

> 不追求完美防御，目标是提高自动化刷票成本。
