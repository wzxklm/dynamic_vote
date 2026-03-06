export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStats, exportToMarkdown } from "@/lib/stats";

export async function GET() {
  console.log("[API] GET /export");
  try {
    const stats = await getStats();
    const markdown = exportToMarkdown(stats.tree);
    console.log(`[API] GET /export → ${markdown.length} bytes`);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vps-ip-stats.md"',
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
