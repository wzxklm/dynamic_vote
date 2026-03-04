# 统计与导出模块

> 旭日图数据聚合、Markdown 导出、占比计算。涉及文件：`src/lib/stats.ts`、`src/app/api/stats/route.ts`、`src/app/api/export/route.ts`

## 一、旭日图树结构

### 数据层级

```
是否被封 → 厂商(org) → ASN → 用途(usage) → 协议(protocol) → 关键配置(keyConfig)
```

- 用途=网站的投票在"用途"层即为叶子节点（无协议/配置子层）
- 用途=代理的投票完整展开 6 层

### 聚合逻辑

1. 分两次查询：代理类按 6 个字段 groupBy，网站类按 4 个字段 groupBy
2. 过滤条件：`WHERE resolved=true`
3. 聚合值使用 `SUM(count)`（非 `COUNT(*)`）
4. 将扁平聚合结果递归组装为嵌套树结构（`TreeNode { name, value, children? }`）
5. 每层 children 按 `value` 降序排列
6. `isBlocked` 字段的展示名：`true` → "被封"，`false` → "未被封"
7. `usage` 字段的展示名：`"proxy"` → "代理"，`"website"` → "网站"

### 缓存

- Redis 缓存，key: `stats:sunburst`，TTL = 2 分钟
- 缓存过期后下次访问重新从 DB 聚合
- 无需事件驱动更新，TTL 天然防抖

## 二、Markdown 扁平表导出

将旭日图树展开为扁平行，每行是一条从根到叶的完整路径：

```markdown
总投票数: {SUM(count)} 台

| 是否被封 | 厂商 | ASN | 用途 | 协议 | 关键配置 | 数量 | 占父级比 | 占总比 |
```

### 占比计算

- **占父级比** = 当前节点 value / 父节点 value — 同层各子节点占父级比之和为 100%
- **占总比** = 当前节点 value / 全局总 SUM(count)
- 百分比保留一位小数

### 网站类投票行

用途=网站的投票在"用途"层即为叶子节点，导出时协议和关键配置列填 `-`，占父级比相对 ASN 节点计算。

### 排序

按层级从左到右排序，同层内按数量降序。

## 三、导出接口缓存

- `/api/export` 复用旭日图同一份缓存数据（Redis key: `stats:sunburst`）
- 导出逻辑：从缓存读取树结构 → 展开为扁平行 → 拼接 Markdown 表格
- 这样确保旭日图和导出表格数据一致，避免因分别查库导致不一致
- 若缓存不存在则触发一次聚合查询并写入缓存
