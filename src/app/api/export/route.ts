export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStats, exportToMarkdown } from "@/lib/stats";

export async function GET() {
  try {
    const stats = await getStats();
    const markdown = exportToMarkdown(stats.tree);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
