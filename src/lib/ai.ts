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
