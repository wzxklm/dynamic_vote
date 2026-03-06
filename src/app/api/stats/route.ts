export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStats } from "@/lib/stats";

export async function GET() {
  console.log("[API] GET /stats");
  try {
    const stats = await getStats();
    console.log(`[API] GET /stats → total=${stats.total}`);
    return NextResponse.json({
      total: stats.total,
      updatedAt: stats.updatedAt,
      tree: stats.tree,
    });
  } catch (error) {
    console.error("Stats aggregation error:", error);
    return NextResponse.json({ error: "统计数据获取失败" }, { status: 500 });
  }
}
