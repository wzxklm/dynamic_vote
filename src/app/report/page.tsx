"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
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
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">AI 分析报告</h1>
        <div className="flex gap-3">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "生成中..." : report ? "重新生成" : "生成报告"}
          </Button>
          <Link href="/">
            <Button variant="outline">返回首页</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-6 text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-64 text-gray-500">
          加载中...
        </div>
      )}

      {!loading && !report && !error && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-4">
          <p>尚未生成过报告</p>
          <p className="text-sm">点击上方"生成报告"按钮，AI 将根据当前投票数据生成分析报告</p>
        </div>
      )}

      {generating && (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
            <p>AI 正在分析数据并生成报告，请稍候...</p>
          </div>
        </div>
      )}

      {!loading && !generating && report && (
        <>
          {/* Expiry notice */}
          <div className="rounded-md bg-gray-50 p-3 mb-6 text-sm text-gray-600 flex items-center justify-between">
            <span>
              上次生成：{formatTimeAgo(report.generatedAt)}（基于{" "}
              {report.totalVotesAtGeneration} 条投票）
            </span>
            {newVotes > 0 && (
              <span className="text-amber-600 font-medium">
                此后新增 {newVotes} 条投票
              </span>
            )}
          </div>

          {/* Report content */}
          <article className="prose prose-gray max-w-none">
            <ReactMarkdown>{report.report}</ReactMarkdown>
          </article>
        </>
      )}
    </main>
  );
}
