# 动态选项模块

> 处理用户自定义输入的选项匹配、去重和升级。涉及文件：`src/lib/queue.ts`、`src/lib/ai.ts`、`src/lib/vote-service.ts`

## 一、队列架构

每个层级（org / asn / protocol / keyConfig）使用独立的 BullMQ 队列，实现**层间并行、层内串行**。

队列任务数据：`{ voteId, layer, value, parentKey, fingerprint }`

Worker 配置：
- `concurrency: 1` — 同层级串行，确保 AI 匹配时能看到前序结果
- `limiter: { max: 10, duration: 60_000 }` — 每层每分钟最多 10 个任务

## 二、提交时字段分类

投票提交后，逐字段判断是否为已知选项（`isPreset=true` 或 `promoted=true`）：

- 查询条件需包含 `parentKey` 精确匹配（如 ASN 层需匹配对应的 org 值）
- 全部已知 → `resolved=true`，投票直接参与统计
- 含自定义字段 → `resolved=false`，为每个自定义字段创建对应层级的队列任务

## 三、AI 匹配规则

**候选选项范围：** 同层级 + 同 parentKey 下的所有 DynamicOption（预设 + 自定义，无论是否升级）

**AI 判断逻辑：** 判断用户输入与候选列表中某项是否等价。等价包括：
- 多语言表述：日本 = JP = Japan
- 缩写/简称：搬瓦工 = BWG = BandwagonHost
- 俗称/别名：DMIT = 大妈IT
- 大小写变体：vultr = Vultr = VULTR

**AI 返回格式：** `{"matched": true, "option_id": "xxx"}` 或 `{"matched": false, "option_id": null}`

**Prompt 设计要点：**
- System Prompt 定义等价判断规则，要求严格返回 JSON
- User Prompt 提供：当前层级、候选选项列表（含 ID）、用户输入
- 使用轻量模型（`AI_MODEL_LIGHT`，Gemini Flash）
- 设置 `temperature: 0`，确保等价匹配结果的确定性和一致性
- 使用 `response_format: { type: "json_object" }`（OpenAI 兼容 JSON 模式），确保返回合法 JSON，避免自由文本解析失败

## 四、匹配结果处理

1. **匹配成功** → 将 Vote 的对应字段值更新为 DynamicOption.value（值归一化），调用去重计数
2. **匹配失败** → 创建新 DynamicOption（`submitCount=1`），同时创建 OptionContributor 记录
3. **去重计数** — 利用 OptionContributor 的 `@@unique([optionId, fingerprint])` 约束：事务中先 create Contributor 再 increment submitCount，唯一约束冲突（P2002）则静默忽略
4. **升级判定** — `submitCount >= 3` → 标记 `promoted=true`，根据 `option.layer` 确定对应的 Vote 字段（org/asn/protocol/keyConfig），查询 `WHERE {layer_field} = option.value AND resolved = false` 找到所有引用该选项的投票，逐条调用 `tryResolveVote` 检查是否可 resolve
5. **每次处理完** → 调用 `tryResolveVote(voteId)` 检查该投票是否所有字段都已是预设/已升级选项

**值归一化示例：** 假设 protocol 层无预设的某协议，三个用户先后提交 "hy2"、"Hysteria 2"、"hysteria2"，AI 将后两者匹配到首个 DynamicOption(value="hy2")，三条 Vote 的 protocol 字段最终统一为 "hy2"。若用户输入与预设选项等价（如输入 "BWG"，预设为 "搬瓦工 (IT7)"），AI 会将其匹配到预设选项，Vote 字段归一化为预设值 "搬瓦工 (IT7)"。

**已知限制：** 自定义选项的显示名称取决于首个提交者的输入（如首个提交者输入 "hy2"，升级后前端也显示 "hy2"）。如需修正显示名称，可后续手动更新 DynamicOption.value，关联投票的字段值也需同步更新。

## 五、事务保障与孤儿恢复

投票入库与队列入队在同一操作流程中完成：

- **入队失败重试** — 入库成功后，入队最多重试 3 次（间隔 1s），全失败则标记 `queueFailed=true`
- **孤儿投票恢复** — 使用 BullMQ repeatable job（在 `src/lib/queue.ts` 中注册，cron 每 5 分钟执行），扫描 `resolved=false AND queueFailed=false AND createdAt < 10分钟前` 的投票。对每条投票重新执行字段分类（逐字段查询 DynamicOption 判断是否为已知选项），为仍未匹配的自定义字段重新创建队列任务

## 六、容错与降级

| 场景 | 处理方式 |
|------|----------|
| AI 返回 JSON 格式异常（JSON mode 下极少出现） | 立即重试 1 次 |
| 网络超时 / 5xx 错误 | 指数退避重试 3 次（2s → 4s → 8s） |
| 全部重试失败 | 进入 BullMQ 死信队列 |
| 死信队列 | 每小时自动重试；超 24 小时标记 failed |
| AI 连续 10 分钟不可用 | 自动降级为精确字符串匹配（大小写无关 + trim），AI 恢复后重新入队处理 |

## 七、选项列表缓存

- Redis 缓存，key 格式：`options:{layer}` 或 `options:{layer}:{parentKey}`
- TTL = 10 分钟
- 选项升级时主动清除对应 key（无 parentKey 的层级直接 DEL，有 parentKey 的按精确 key DEL）
- 预设选项通过 seed 脚本写入 DynamicOption 表（`isPreset=true, promoted=true`）
