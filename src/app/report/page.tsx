"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReportResponse } from "@/types";

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-6 w-1/2 mt-4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/report");
      if (res.status === 404) {
        setReport(null);
        return;
      }
      if (!res.ok) throw new Error("获取报告失败");
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleGenerate = useCallback(async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/report", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "生成报告失败");
      }
      const data = await res.json();
      setReport({ ...data, currentTotalVotes: data.totalVotesAtGeneration });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, []);

  const newVotes =
    report?.currentTotalVotes != null
      ? report.currentTotalVotes - report.totalVotesAtGeneration
      : 0;

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">AI 分析报告</h1>
          <ThemeToggle />
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 shrink-0">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "生成中..." : report ? "重新生成" : "生成报告"}
          </Button>
          <Link href="/">
            <Button variant="outline">返回首页</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 mb-6 text-destructive">
          {error}
        </div>
      )}

      {loading && <ReportSkeleton />}

      {!loading && !report && !error && (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
          <p>尚未生成过报告</p>
          <p className="text-sm">点击上方&ldquo;生成报告&rdquo;按钮，AI 将根据当前投票数据生成分析报告</p>
        </div>
      )}

      {generating && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p>AI 正在分析数据并生成报告，请稍候...</p>
          </div>
        </div>
      )}

      {!loading && !generating && report && (
        <>
          <div className="rounded-md bg-muted p-3 mb-6 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              上次生成：{formatTimeAgo(report.generatedAt)}（基于{" "}
              {report.totalVotesAtGeneration} 条投票）
            </span>
            {newVotes > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                此后新增 {newVotes} 条投票
              </span>
            )}
          </div>

          <article className="prose prose-gray dark:prose-invert max-w-none">
            <ReactMarkdown>{report.report}</ReactMarkdown>
          </article>
        </>
      )}
    </main>
  );
}
