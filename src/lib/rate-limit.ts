import { redis } from "./db";

interface RateLimitResult {
  allowed: boolean;
  retryAfter: number; // seconds until next allowed request
}

/**
 * Sliding window rate limiter using Redis sorted sets.
 * @param key - Redis key identifier (e.g., "ratelimit:vote:ip:1.2.3.4")
 * @param limit - Maximum number of requests allowed
 * @param windowMs - Time window in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Step 1: Remove expired entries and count current window
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zcard(key);
  const results = await multi.exec();
  const count = (results?.[1]?.[1] as number) ?? 0;

  if (count >= limit) {
    // Find oldest entry to calculate retry time
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    const oldestTime = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
    const retryAfter = Math.ceil((oldestTime + windowMs - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
  }

  // Step 2: Only add entry if under limit
  await redis.zadd(key, now, `${now}:${Math.random()}`);
  await redis.pexpire(key, windowMs);
  return { allowed: true, retryAfter: 0 };
}

// --- Vote rate limiting ---

export async function checkVoteRateLimit(
  ip: string,
  fingerprint: string
): Promise<RateLimitResult> {
  const hourMs = 60 * 60 * 1000;

  // Check IP + fingerprint dimension (10/hour per device)
  const deviceResult = await checkRateLimit(
    `ratelimit:vote:device:${ip}:${fingerprint}`,
    parseInt(process.env.RATE_LIMIT_VOTE_PER_HOUR || "10", 10),
    hourMs
  );
  if (!deviceResult.allowed) return deviceResult;

  // Check IP dimension (30/hour per IP)
  const ipResult = await checkRateLimit(
    `ratelimit:vote:ip:${ip}`,
    30,
    hourMs
  );
  return ipResult;
}

// --- IP lookup rate limiting (global) ---

export async function checkIpLookupRateLimit(): Promise<RateLimitResult> {
  return checkRateLimit(
    "ratelimit:ip-lookup:global",
    parseInt(process.env.RATE_LIMIT_IP_LOOKUP_PER_MINUTE || "40", 10),
    60 * 1000
  );
}

// --- Report rate limiting ---

export async function checkReportRateLimit(
  ip: string
): Promise<RateLimitResult> {
  return checkRateLimit(
    `ratelimit:report:ip:${ip}`,
    parseInt(process.env.RATE_LIMIT_REPORT_PER_HOUR || "3", 10),
    60 * 60 * 1000
  );
}

// --- Fingerprint validation ---

export function validateFingerprint(fingerprint: string): boolean {
  return /^[a-f0-9]{32}$/.test(fingerprint);
}

/**
 * Check fingerprint anti-forgery rules:
 * 1. One fingerprint can only be used from limited IPs within 24h
 * 2. One IP can only have limited fingerprints within 24h
 */
export async function checkFingerprintAntiForge(
  ip: string,
  fingerprint: string
): Promise<{ valid: boolean; error?: string }> {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const windowStart = now - dayMs;

  // Track fingerprint -> IP binding
  const fpKey = `fp:ips:${fingerprint}`;
  await redis.zremrangebyscore(fpKey, 0, windowStart);
  await redis.zadd(fpKey, now, ip);
  await redis.pexpire(fpKey, dayMs);
  const fpIpCount = await redis.zcard(fpKey);
  if (fpIpCount > 5) {
    return { valid: false, error: "指纹异常：关联 IP 过多" };
  }

  // Track IP -> fingerprint count
  const ipKey = `ip:fps:${ip}`;
  await redis.zremrangebyscore(ipKey, 0, windowStart);
  await redis.zadd(ipKey, now, fingerprint);
  await redis.pexpire(ipKey, dayMs);
  const ipFpCount = await redis.zcard(ipKey);
  if (ipFpCount > 10) {
    return { valid: false, error: "IP 异常：关联指纹过多" };
  }

  return { valid: true };
}

/**
 * Validate request headers to detect non-browser automated requests.
 * Checks User-Agent and Accept-Language for basic browser characteristics.
 */
export function validateRequestHeaders(headers: Headers): {
  valid: boolean;
  error?: string;
} {
  const userAgent = headers.get("user-agent") || "";
  const acceptLanguage = headers.get("accept-language") || "";

  // Reject empty or very short User-Agent (likely bots/scripts)
  if (!userAgent || userAgent.length < 20) {
    return { valid: false, error: "请求特征异常" };
  }

  // Reject common bot/script User-Agents
  const botPatterns = /curl|wget|python|httpie|postman|insomnia|node-fetch|axios/i;
  if (botPatterns.test(userAgent)) {
    return { valid: false, error: "请求特征异常" };
  }

  // Require Accept-Language header (browsers always send this)
  if (!acceptLanguage) {
    return { valid: false, error: "请求特征异常" };
  }

  return { valid: true };
}
