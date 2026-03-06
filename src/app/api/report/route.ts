export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStats, exportToMarkdown } from "@/lib/stats";
import { generateReport } from "@/lib/ai";
import { checkReportRateLimit } from "@/lib/rate-limit";
import { getClientIp, errorResponse } from "@/lib/utils";

/**
 * GET /api/report — Retrieve cached AI report
 */
export async function GET() {
  try {
    const report = await prisma.report.findFirst({
      orderBy: { generatedAt: "desc" },
    });

    if (!report) {
      return errorResponse("尚未生成过报告", 404);
    }

    // Get current total votes for expiry detection
    const result = await prisma.vote.aggregate({
      where: { resolved: true },
      _sum: { count: true },
    });
    const currentTotalVotes = result._sum.count ?? 0;

    return NextResponse.json({
      report: report.content,
      generatedAt: report.generatedAt.toISOString(),
      totalVotesAtGeneration: report.totalVotesAtGeneration,
      currentTotalVotes,
    });
  } catch (error) {
    console.error("Report retrieval failed:", error);
    return errorResponse("服务器内部错误", 500);
  }
}

/**
 * POST /api/report — Generate new AI report
 */
export async function POST(request: NextRequest) {
  // Rate limit
  const ip = getClientIp(request);

  const rateLimit = await checkReportRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", retryAfter: rateLimit.retryAfter },
      { status: 429 }
    );
  }

  // Generate report via AI
  try {
    // Get export data
    const stats = await getStats();
    const markdownTable = exportToMarkdown(stats.tree);

    // Snapshot total votes BEFORE AI call to match the data the report is based on
    const totalVotesAtGeneration = stats.total;

    const reportContent = await generateReport(markdownTable);

    // Atomically delete old reports and save new one
    const [, report] = await prisma.$transaction([
      prisma.report.deleteMany(),
      prisma.report.create({
        data: {
          content: reportContent,
          totalVotesAtGeneration,
        },
      }),
    ]);

    return NextResponse.json({
      report: report.content,
      generatedAt: report.generatedAt.toISOString(),
      totalVotesAtGeneration: report.totalVotesAtGeneration,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown AI error";

    if (message === "TIMEOUT") {
      return errorResponse("AI 服务响应超时，请稍后再试", 504);
    }

    console.error("Report generation failed:", error);
    return errorResponse("AI 服务不可用，请稍后再试", 502);
  }
}
