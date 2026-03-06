import OpenAI from "openai";

const globalForAI = globalThis as unknown as { ai: OpenAI };

function getAI(): OpenAI {
  if (!globalForAI.ai) {
    globalForAI.ai = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });
  }
  return globalForAI.ai;
}

// Lazy accessor — only instantiated at runtime when first used
export const ai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getAI() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// --- Shared constants and utilities ---

const EQUIVALENCE_RULES = `等价规则：
- 多语言表述：日本 = JP = Japan
- 缩写/简称：搬瓦工 = BWG = BandwagonHost
- 俗称/别名：DMIT = 大妈IT
- 大小写变体：vultr = Vultr = VULTR
- 技术等价：Hysteria2 = hy2 = Hysteria 2

判断标准：严格等价才算匹配，含义相近但不同的选项不算匹配。
例如 "Shadowsocks" 和 "ShadowsocksR" 不等价。`;

function extractContent(response: OpenAI.Chat.Completions.ChatCompletion): string {
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  return content;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    delays: number[];
    label?: string;
    shouldRetryImmediately?: (error: unknown, attempt: number) => boolean;
    transformError?: (error: unknown) => Error;
  }
): Promise<T> {
  const { delays, label, shouldRetryImmediately, transformError } = opts;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (shouldRetryImmediately?.(error, attempt)) {
        console.warn(`[AI] ${label || "request"} immediate retry attempt=${attempt + 1}`);
        continue;
      }
      if (attempt >= delays.length) {
        console.warn(`[AI] ${label || "request"} failed after ${attempt + 1} attempts`);
        throw transformError ? transformError(error) : error;
      }
      console.warn(`[AI] ${label || "request"} retry attempt=${attempt + 1} delay=${delays[attempt]}ms`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error("Retry exhausted");
}

// --- AI Match Option ---

interface MatchCandidate {
  id: string;
  value: string;
}

interface MatchResult {
  matched: boolean;
  option_id: string | null;
}

const MATCH_SYSTEM_PROMPT = `你是一个选项匹配系统。判断用户输入是否与候选列表中某一项等价。

${EQUIVALENCE_RULES}

严格返回 JSON，不要解释，不要添加额外字段。`;

/**
 * Use AI to match user input against candidate options.
 * Returns match result with option_id if matched.
 * Retries once on JSON parse error, uses exponential backoff for network errors.
 */
export async function matchOption(
  layer: string,
  candidates: MatchCandidate[],
  userInput: string
): Promise<MatchResult> {
  if (candidates.length === 0) {
    console.log(`[AI] matchOption layer=${layer} input="${userInput}" → skipped (no candidates)`);
    return { matched: false, option_id: null };
  }

  console.log(`[AI] matchOption layer=${layer} input="${userInput}" candidates=${candidates.length}`);

  const optionsJson = JSON.stringify(
    candidates.map((c) => ({ id: c.id, value: c.value }))
  );

  const userPrompt = `层级：${layer}
候选选项列表：
${optionsJson}

用户输入："${userInput}"

判断用户输入是否与候选列表中某一项等价。返回 JSON：
- 匹配：{"matched": true, "option_id": "对应选项的 id"}
- 不匹配：{"matched": false, "option_id": null}`;

  const makeRequest = async (): Promise<MatchResult> => {
    const response = await ai.chat.completions.create({
      model: process.env.AI_MODEL_LIGHT || "gemini-flash-latest",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: MATCH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = extractContent(response);
    const parsed = JSON.parse(content) as MatchResult;
    if (typeof parsed.matched !== "boolean") {
      throw new Error("Invalid AI response format");
    }
    if (parsed.matched && !parsed.option_id) {
      return { matched: false, option_id: null };
    }
    return parsed;
  };

  const result = await retryWithBackoff(makeRequest, {
    delays: [2000, 4000, 8000],
    label: `matchOption(${layer})`,
    shouldRetryImmediately: (error, attempt) => {
      const isJsonError =
        error instanceof SyntaxError ||
        (error instanceof Error && error.message === "Invalid AI response format");
      return isJsonError && attempt === 0;
    },
  });

  console.log(`[AI] matchOption layer=${layer} → matched=${result.matched} option_id=${result.option_id}`);
  return result;
}

// --- AI Report Generation ---

const REPORT_SYSTEM_PROMPT = `你是一名专业的网络安全分析师。你将收到一份 VPS IP 封锁投票统计数据（Markdown 表格），请据此生成分析报告。

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
高风险因素总结、降低封锁风险的具体建议。`;

/**
 * Generate AI analysis report from Markdown export data.
 * Retries up to 2 times on failure (3s, 6s delays). 60s timeout.
 */
export async function generateReport(markdownTable: string): Promise<string> {
  console.log(`[AI] generateReport dataLength=${markdownTable.length}`);

  const userPrompt = `以下是 VPS IP 封锁投票统计数据（Markdown 表格），请据此生成分析报告：\n\n${markdownTable}`;

  const makeRequest = async (): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await ai.chat.completions.create(
        {
          model: process.env.AI_MODEL_FULL || "gemini-pro-latest",
          temperature: 0.3,
          messages: [
            { role: "system", content: REPORT_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        },
        { signal: controller.signal }
      );

      const content = extractContent(response);
      if (content.trim().length === 0) {
        throw new Error("AI returned empty content");
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  };

  const result = await retryWithBackoff(makeRequest, {
    delays: [3000, 6000],
    label: "generateReport",
    transformError: (error) => {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn("[AI] generateReport → timeout");
        return new Error("TIMEOUT");
      }
      return error instanceof Error ? error : new Error("Unknown AI error");
    },
  });

  console.log(`[AI] generateReport → done length=${result.length}`);
  return result;
}

// --- AI Option Clustering ---

interface ClusterCandidate {
  id: string;
  value: string;
  submitCount: number;
}

export interface ClusterResult {
  clusters: Array<{
    canonical_id: string;
    member_ids: string[];
  }>;
}

const CLUSTER_SYSTEM_PROMPT = `你是一个选项聚类系统。给定一组选项，识别语义等价的选项并分组。

${EQUIVALENCE_RULES}

要求：
- 只返回有 2 个及以上成员的组
- 每组中 canonical_id 选 submitCount 最高的选项，submitCount 相同则选排在前面的
- 不属于任何组的单独选项不要出现在结果中

严格返回 JSON，不要解释，不要添加额外字段。`;

/**
 * Use AI to cluster semantically equivalent options.
 * Returns groups of equivalent options with a canonical for each group.
 * Retries with exponential backoff on failure.
 */
export async function clusterOptions(
  layer: string,
  candidates: ClusterCandidate[]
): Promise<ClusterResult> {
  console.log(`[AI] clusterOptions layer=${layer} candidates=${candidates.length}`);

  const optionsJson = JSON.stringify(
    candidates.map((c) => ({ id: c.id, value: c.value, submitCount: c.submitCount }))
  );

  const userPrompt = `层级：${layer}
选项列表：
${optionsJson}

识别语义等价的选项并分组。返回 JSON：
{"clusters": [{"canonical_id": "submitCount最高的选项id", "member_ids": ["该组所有成员的id，包括canonical"]}]}

如果没有任何等价组，返回：{"clusters": []}`;

  const makeRequest = async (): Promise<ClusterResult> => {
    const response = await ai.chat.completions.create({
      model: process.env.AI_MODEL_LIGHT || "gemini-flash-latest",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CLUSTER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = extractContent(response);
    const parsed = JSON.parse(content) as ClusterResult;
    if (!Array.isArray(parsed.clusters)) {
      throw new Error("Invalid AI cluster response format");
    }
    return parsed;
  };

  const result = await retryWithBackoff(makeRequest, {
    delays: [2000, 4000, 8000],
    label: `clusterOptions(${layer})`,
    shouldRetryImmediately: (error, attempt) => {
      const isJsonError =
        error instanceof SyntaxError ||
        (error instanceof Error && error.message === "Invalid AI cluster response format");
      return isJsonError && attempt === 0;
    },
  });

  console.log(`[AI] clusterOptions layer=${layer} → ${result.clusters.length} clusters`);
  return result;
}
