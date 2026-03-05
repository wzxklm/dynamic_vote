export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/db";

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
  const cached = await redis.get(cacheKey);
  if (cached) {
    return NextResponse.json(JSON.parse(cached));
  }

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

  // Cache result
  await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL);

  return NextResponse.json(result);
}
