# AI 分析报告模块

> AI 驱动的封锁分析报告生成。涉及文件：`src/app/api/report/route.ts`、`src/lib/ai.ts`

## 一、触发机制

- 用户在报告页面手动点击"生成报告"按钮，不自动生成
- 使用完整模型（`AI_MODEL_FULL`，Gemini Pro）生成

## 二、输入数据

调用 `GET /api/export` 获取完整 Markdown 扁平表，作为 AI 输入。

## 三、Prompt 设计

### 报告生成 Prompt

**System Prompt：**

```text
你是一名专业的网络安全分析师。你将收到一份 VPS IP 封锁投票统计数据（Markdown 表格），请据此生成分析报告。

要求：
- 输出 Markdown 格式
- 语言简练、数据驱动，所有百分比保留一位小数
- 仅引用表格中实际出现的数据，不得编造、推测或补充表格中不存在的数值和组合
- 如果某个维度数据量不足以得出结论，请明确说明"数据不足，暂无法判断"

报告结构（严格按以下顺序）：

## 总体概况
总投票数、被封/未被封各自数量和占比。

## 高风险组合 TOP 5
封锁率最高的完整路径（厂商→ASN→用途→协议→配置），附数量和占总比。仅列出表格中实际存在的组合。

## 低风险组合 TOP 5
封锁率最低（未被封占比高）的组合路径，附数量和占总比。

## 厂商维度分析
各厂商的封锁率对比，同厂商不同 ASN 的差异。数据不足的厂商标注"样本量少，仅供参考"。

## 协议维度分析
各协议的封锁率对比，关键配置对封锁率的影响。

## 结论与建议
高风险因素总结、降低封锁风险的具体建议。
```

**User Prompt：**

```text
以下是 VPS IP 封锁投票统计数据（Markdown 表格），请据此生成分析报告：

{markdown_table}
```

### 动态选项匹配 Prompt（参考，详见 dynamic-options.md）

**System Prompt：**

```text
你是一个选项匹配系统。判断用户输入是否与候选列表中某一项等价。

等价规则：
- 多语言表述：日本 = JP = Japan
- 缩写/简称：搬瓦工 = BWG = BandwagonHost
- 俗称/别名：DMIT = 大妈IT
- 大小写变体：vultr = Vultr = VULTR
- 技术等价：Hysteria2 = hy2 = Hysteria 2

判断标准：严格等价才算匹配，含义相近但不同的选项不算匹配。
例如 "Shadowsocks" 和 "ShadowsocksR" 不等价。

严格返回 JSON，不要解释，不要添加额外字段。
```

**User Prompt：**

```text
层级：{layer}
候选选项列表：
{options_json}

用户输入："{user_input}"

判断用户输入是否与候选列表中某一项等价。返回 JSON：
- 匹配：{"matched": true, "option_id": "对应选项的 id"}
- 不匹配：{"matched": false, "option_id": null}
```

## 四、存储与过期提示

- 生成后持久化到 `Report` 表，记录 `generatedAt` 和 `totalVotesAtGeneration`
- `GET /api/report` 返回时额外查询当前 `SUM(count) WHERE resolved=true` 作为 `currentTotalVotes`
- 前端对比两个数值展示过期提示，如"上次生成：2小时前 | 此后新增 42 条投票"

## 五、容错处理

| 场景 | 处理方式 |
|------|----------|
| AI 响应超时 | 设置 60 秒超时，超时返回 504 |
| AI 返回异常（5xx / 网络错误） | 重试 2 次（间隔 3s → 6s），全失败返回 502 |
| AI 返回内容为空 | 视为异常，触发重试 |
