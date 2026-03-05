export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStats, exportToMarkdown } from "@/lib/stats";
import { generateReport } from "@/lib/ai";
import { checkReportRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/report — Retrieve cached AI report
 */
export async function GET() {
  const report = await prisma.report.findFirst({
    orderBy: { generatedAt: "desc" },
  });

  if (!report) {
    return NextResponse.json({ error: "尚未生成过报告" }, { status: 404 });
  }

  // Get current total votes for expiry detection
  const result = await prisma.vote.aggregate({
    where: { resolved: true },
    _sum: { count: true },
  });
  const currentTotalVotes = result._sum.count || 0;

  return NextResponse.json({
    report: report.content,
    generatedAt: report.generatedAt.toISOString(),
    totalVotesAtGeneration: report.totalVotesAtGeneration,
    currentTotalVotes,
  });
}

/**
 * POST /api/report — Generate new AI report
 */
export async function POST(request: NextRequest) {
  // Rate limit
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rateLimit = await checkReportRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", retryAfter: rateLimit.retryAfter },
      { status: 429 }
    );
  }

  // Get export data
  const stats = await getStats();
  const markdownTable = exportToMarkdown(stats.tree);

  // Generate report via AI
  try {
    const reportContent = await generateReport(markdownTable);

    // Get total votes snapshot
    const totalResult = await prisma.vote.aggregate({
      where: { resolved: true },
      _sum: { count: true },
    });
    const totalVotesAtGeneration = totalResult._sum.count || 0;

    // Delete old reports and save new one
    await prisma.report.deleteMany();
    const report = await prisma.report.create({
      data: {
        content: reportContent,
        totalVotesAtGeneration,
      },
    });

    return NextResponse.json({
      report: report.content,
      generatedAt: report.generatedAt.toISOString(),
      totalVotesAtGeneration: report.totalVotesAtGeneration,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown AI error";

    if (message === "TIMEOUT") {
      return NextResponse.json(
        { error: "AI 服务响应超时，请稍后再试" },
        { status: 504 }
      );
    }

    console.error("Report generation failed:", error);
    return NextResponse.json(
      { error: "AI 服务不可用，请稍后再试" },
      { status: 502 }
    );
  }
}
