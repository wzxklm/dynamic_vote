import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const VALID_LAYERS = ["org", "asn", "protocol", "keyConfig"];

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

  return NextResponse.json({ layer, options });
}
