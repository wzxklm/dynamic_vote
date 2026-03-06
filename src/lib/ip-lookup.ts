import { redis } from "./db";

export interface IpLookupResult {
  org: string;
  asn: string;
  country: string;
  city: string;
}

const CACHE_TTL = 3600; // 1 hour in seconds

/**
 * Lookup IP information using ip-api.com (primary) with ipinfo.io fallback.
 * Results are cached in Redis for 1 hour.
 */
export async function lookupIp(ip: string): Promise<IpLookupResult> {
  // Check cache first
  const cacheKey = `ip:${ip}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`[IP] cache hit ip=${ip}`);
    return JSON.parse(cached);
  }

  let result: IpLookupResult;

  try {
    console.log(`[IP] primary lookup ip=${ip}`);
    result = await lookupPrimary(ip);
  } catch (err) {
    console.warn(`[IP] primary failed ip=${ip}: ${err instanceof Error ? err.message : err}`);
    console.log(`[IP] fallback lookup ip=${ip}`);
    result = await lookupFallback(ip);
  }

  // Cache the result
  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);

  return result;
}

async function lookupPrimary(ip: string): Promise<IpLookupResult> {
  const baseUrl = process.env.IP_API_PRIMARY || "http://ip-api.com/json";
  const res = await fetch(`${baseUrl}/${ip}?fields=org,as,country,city`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`ip-api.com returned ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "fail") {
    throw new Error(data.message || "IP lookup failed");
  }

  // ip-api.com returns "as" field like "AS20473 The Constant Company, LLC"
  const asField: string = data.as || "";
  const asnMatch = asField.match(/^(AS\d+)/);
  const asn = asnMatch ? asnMatch[1] : asField;

  return {
    org: data.org || "",
    asn,
    country: data.country || "",
    city: data.city || "",
  };
}

async function lookupFallback(ip: string): Promise<IpLookupResult> {
  const baseUrl = process.env.IP_API_FALLBACK || "https://ipinfo.io";
  const token = process.env.IP_API_FALLBACK_TOKEN;

  const url = token
    ? `${baseUrl}/${ip}/json?token=${token}`
    : `${baseUrl}/${ip}/json`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`ipinfo.io returned ${res.status}`);
  }

  const data = await res.json();

  // ipinfo.io returns org as "AS20473 The Constant Company, LLC"
  const orgField: string = data.org || "";
  const asnMatch = orgField.match(/^(AS\d+)\s+(.*)/);
  const asn = asnMatch ? asnMatch[1] : "";
  const org = asnMatch ? asnMatch[2] : orgField;

  return {
    org,
    asn,
    country: data.country || "",
    city: data.city || "",
  };
}
