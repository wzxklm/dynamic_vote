import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const globalForAI = globalThis as unknown as { ai: GoogleGenAI };

function getAI(): GoogleGenAI {
  if (!globalForAI.ai) {
    globalForAI.ai = new GoogleGenAI({
      apiKey: process.env.AI_API_KEY,
    });
  }
  return globalForAI.ai;
}

// Lazy accessor — only instantiated at runtime when first used
export const ai = new Proxy({} as GoogleGenAI, {
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
- 带修饰词的变体：如 "sni用大学域名" 和 "SNI使用大学域名" 等价

判断标准：严格等价才算匹配，含义相近但不同的选项不算匹配。
例如 "Shadowsocks" 和 "ShadowsocksR" 不等价。`;

const layerRules = (action: string) => `各层级${action}严格度不同：
- org（机构/厂商）：严格等价。不同公司绝不${action}（如 "PEG Tech Inc" ≠ "RackNerd"，"搬瓦工" ≠ "DMIT"）
- asn（AS号）：严格等价。不同 ASN 绝不${action}（如 "AS54600" ≠ "AS25820"）
- protocol（协议）：严格等价。不同协议绝不${action}（如 "Shadowsocks" ≠ "ShadowsocksR"，"VLESS" ≠ "VMess"）
- keyConfig（密钥配置）：宽松${action}。用户描述可能模糊，含义相近即可${action}（如 "443端口" ≈ "端口443"，"sni用大学域名" ≈ "SNI伪装成edu域名"）`;

const COMBINATION_RULES = `组合输入处理：
- 如果输入包含多个值（用"和""与""+"","等连接），只要其中任意一个与候选项等价，即视为匹配
- 组合值与单值的包含关系也算等价：如 "hysteria2和vless" 与 "Hysteria2" 等价`;

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

重要原则：
- 宁可不匹配也不要错误匹配。如果没有真正等价的选项，必须返回 matched: false

${layerRules("匹配")}

${COMBINATION_RULES}

特殊情况处理：
- 如果用户输入同时匹配多个候选项，选择第一个匹配的

严格返回 JSON，不要解释，不要添加额外字段。`;

const matchResultSchema = z.object({
  matched: z.boolean(),
  option_id: z.nullable(z.string()),
});

/**
 * Use AI to match user input against candidate options.
 * Returns match result with option_id if matched.
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

判断用户输入是否与候选列表中某一项等价（含组合输入中的部分匹配）。`;

  const makeRequest = async (): Promise<MatchResult> => {
    const response = await ai.models.generateContent({
      model: process.env.AI_MODEL_LIGHT || "gemini-flash-latest",
      contents: userPrompt,
      config: {
        systemInstruction: MATCH_SYSTEM_PROMPT,
        temperature: 0,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(matchResultSchema),
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const content = response.text;
    if (!content) throw new Error("AI returned empty content");

    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Tolerant parsing: coerce string "true"/"false" to boolean
    let matched: boolean;
    if (typeof parsed.matched === "boolean") {
      matched = parsed.matched;
    } else if (typeof parsed.matched === "string") {
      matched = parsed.matched.toLowerCase() === "true";
    } else if (typeof parsed.matched === "number") {
      matched = parsed.matched !== 0;
    } else {
      throw new Error("Invalid AI response format");
    }

    const optionId = typeof parsed.option_id === "string" ? parsed.option_id : null;
    if (matched && !optionId) {
      return { matched: false, option_id: null };
    }
    // Verify option_id actually exists in candidates
    if (matched && !candidates.some((c) => c.id === optionId)) {
      console.warn(`[AI] matchOption → hallucinated option_id="${optionId}", treating as no match`);
      return { matched: false, option_id: null };
    }
    return { matched, option_id: optionId };
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
    const response = await ai.models.generateContent({
      model: process.env.AI_MODEL_FULL || "gemini-pro-latest",
      contents: userPrompt,
      config: {
        systemInstruction: REPORT_SYSTEM_PROMPT,
        temperature: 0.3,
        httpOptions: { timeout: 60000 },
      },
    });

    const content = response.text;
    if (!content || content.trim().length === 0) {
      throw new Error("AI returned empty content");
    }
    return content;
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

重要原则：
- 宁可漏合并也不要错误合并。不确定是否等价时，不要归为一组

${layerRules("合并")}

${COMBINATION_RULES}

要求：
- 只返回有 2 个及以上成员的组
- 每组中 canonical_id 选 submitCount 最高的选项，submitCount 相同则选排在前面的
- 不属于任何组的单独选项不要出现在结果中

严格返回 JSON，不要解释，不要添加额外字段。`;

const clusterResultSchema = z.object({
  clusters: z.array(
    z.object({
      canonical_id: z.string(),
      member_ids: z.array(z.string()),
    })
  ),
});

/**
 * Use AI to cluster semantically equivalent options.
 * Returns groups of equivalent options with a canonical for each group.
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

识别语义等价的选项并分组。`;

  const makeRequest = async (): Promise<ClusterResult> => {
    const clusterMaxTokens = Math.min(512 + candidates.length * 128, 8192);
    const response = await ai.models.generateContent({
      model: process.env.AI_MODEL_LIGHT || "gemini-flash-latest",
      contents: userPrompt,
      config: {
        systemInstruction: CLUSTER_SYSTEM_PROMPT,
        temperature: 0,
        maxOutputTokens: clusterMaxTokens,
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(clusterResultSchema),
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const content = response.text;
    if (!content) throw new Error("AI returned empty content");

    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Tolerant parsing: accept clusters at top level or nested
    const rawClusters = Array.isArray(parsed.clusters)
      ? parsed.clusters
      : Array.isArray(parsed.result)
        ? parsed.result
        : null;
    if (!rawClusters) {
      throw new Error("Invalid AI cluster response format");
    }

    // Validate and filter clusters: drop hallucinated IDs, deduplicate membership
    const validIds = new Set(candidates.map((c) => c.id));
    const seen = new Set<string>();
    const validClusters: ClusterResult["clusters"] = [];

    for (const cluster of rawClusters as ClusterResult["clusters"]) {
      if (!cluster.canonical_id || !Array.isArray(cluster.member_ids)) continue;
      const members = cluster.member_ids.filter((id) => validIds.has(id) && !seen.has(id));
      if (members.length < 2) continue;
      const canonicalId = members.includes(cluster.canonical_id) ? cluster.canonical_id : members[0];
      for (const id of members) seen.add(id);
      validClusters.push({ canonical_id: canonicalId, member_ids: members });
    }

    return { clusters: validClusters };
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
