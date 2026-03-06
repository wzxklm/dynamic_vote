export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ipLookupSchema } from "@/lib/validators";
import { lookupIp } from "@/lib/ip-lookup";
import { checkIpLookupRateLimit } from "@/lib/rate-limit";

/**
 * Check if an IP address is private/reserved and should not be looked up
 * via external services.
 */
function isPrivateIp(ip: string): boolean {
  // IPv6 loopback and private ranges
  if (ip === "::1") return true;
  if (/^fc[0-9a-f]{2}:/i.test(ip) || /^fd[0-9a-f]{2}:/i.test(ip)) return true; // fc00::/7 (ULA)
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true; // fe80::/10 (link-local)

  // IPv4 private/reserved ranges
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;                                        // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;  // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;                  // 192.168.0.0/16
    if (parts[0] === 127) return true;                                       // 127.0.0.0/8
  }

  return false;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip") || "";

  // Validate IP format
  const parsed = ipLookupSchema.safeParse({ ip });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "IP 格式无效" },
      { status: 400 }
    );
  }

  // Reject private/reserved IPs
  if (isPrivateIp(parsed.data.ip)) {
    return NextResponse.json(
      { error: "不支持查询私有/保留 IP 地址" },
      { status: 400 }
    );
  }

  // Rate limit check (global — shared across all users by design, see docs/modules/rate-limit.md)
  const rateLimit = await checkIpLookupRateLimit();
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", retryAfter: rateLimit.retryAfter },
      { status: 429 }
    );
  }

  try {
    const result = await lookupIp(parsed.data.ip);
    return NextResponse.json(result);
  } catch (err) {
    console.error("IP lookup error:", err);
    return NextResponse.json(
      { error: "IP 查询服务不可用" },
      { status: 502 }
    );
  }
}
