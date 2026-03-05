export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ipLookupSchema } from "@/lib/validators";
import { lookupIp } from "@/lib/ip-lookup";
import { checkIpLookupRateLimit } from "@/lib/rate-limit";

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

  // Rate limit check (global)
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
