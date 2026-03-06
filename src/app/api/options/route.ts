export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma, redis } from "@/lib/db";

const VALID_LAYERS = ["org", "asn", "protocol", "keyConfig"];
const CACHE_TTL = 600; // 10 minutes in seconds

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer");
  const parentKey = searchParams.get("parentKey") ?? "";

  if (!layer || !VALID_LAYERS.includes(layer)) {
    return NextResponse.json(
      { error: "layer 参数无效，仅支持 org/asn/protocol/keyConfig" },
      { status: 400 }
    );
  }

  // For ASN layer, parentKey (org value) is required
  if (layer === "asn" && !parentKey) {
    return NextResponse.json(
      { error: "查询 ASN 时 parentKey（厂商值）为必填" },
      { status: 400 }
    );
  }

  // Check Redis cache
  const cacheKey = parentKey ? `options:${layer}:${parentKey}` : `options:${layer}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log(`[Cache] hit ${cacheKey}`);
      return NextResponse.json(parsed);
    }
  } catch {
    // Redis unavailable or malformed cache — fall through to database query
  }

  console.log(`[Cache] miss ${cacheKey} → querying DB`);

  // Query database
  const options = await prisma.dynamicOption.findMany({
    where: {
      layer,
      parentKey,
      OR: [{ isPreset: true }, { promoted: true }],
    },
    select: {
      id: true,
      value: true,
      isPreset: true,
      promoted: true,
    },
    orderBy: { value: "asc" },
  });

  const result = { layer, options };

  // Cache result (fire and forget)
  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);
  } catch {
    // Redis unavailable — proceed without caching
  }

  console.log(`[API] GET /options layer=${layer} → ${options.length} items`);
  return NextResponse.json(result);
}
