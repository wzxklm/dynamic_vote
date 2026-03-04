import OpenAI from "openai";

const globalForAI = globalThis as unknown as { ai: OpenAI };

export const ai =
  globalForAI.ai ||
  new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForAI.ai = ai;

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

等价规则：
- 多语言表述：日本 = JP = Japan
- 缩写/简称：搬瓦工 = BWG = BandwagonHost
- 俗称/别名：DMIT = 大妈IT
- 大小写变体：vultr = Vultr = VULTR
- 技术等价：Hysteria2 = hy2 = Hysteria 2

判断标准：严格等价才算匹配，含义相近但不同的选项不算匹配。
例如 "Shadowsocks" 和 "ShadowsocksR" 不等价。

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

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty content");

    const parsed = JSON.parse(content) as MatchResult;
    if (typeof parsed.matched !== "boolean") {
      throw new Error("Invalid AI response format");
    }
    return parsed;
  };

  // Retry logic: JSON parse error → immediate retry once
  // Network/5xx → exponential backoff 3 times (2s, 4s, 8s)
  const delays = [2000, 4000, 8000];

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      return await makeRequest();
    } catch (error) {
      const isJsonError =
        error instanceof SyntaxError ||
        (error instanceof Error && error.message === "Invalid AI response format");

      if (isJsonError && attempt === 0) {
        // Immediate retry for JSON errors (once)
        continue;
      }

      if (attempt >= 3) throw error;

      // Network/5xx: exponential backoff
      const delay = delays[Math.min(attempt, delays.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("AI match failed after all retries");
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

      const content = response.choices[0]?.message?.content;
      if (!content || content.trim().length === 0) {
        throw new Error("AI returned empty content");
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  };

  const delays = [3000, 6000];

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await makeRequest();
    } catch (error) {
      if (attempt >= 2) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error("TIMEOUT");
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  throw new Error("AI report generation failed after all retries");
}

/**
 * Fallback: exact string matching (case-insensitive + trim)
 * Used when AI is unavailable for extended periods.
 */
export function matchOptionFallback(
  candidates: MatchCandidate[],
  userInput: string
): MatchResult {
  const normalized = userInput.trim().toLowerCase();
  const match = candidates.find(
    (c) => c.value.trim().toLowerCase() === normalized
  );
  return match
    ? { matched: true, option_id: match.id }
    : { matched: false, option_id: null };
}
