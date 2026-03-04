"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { SunburstNode } from "@/types";

const SunburstChart = dynamic(() => import("@/components/sunburst-chart"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] sm:h-[600px] text-muted-foreground">
      加载图表中...
    </div>
  ),
});

interface StatsData {
  total: number;
  updatedAt: string;
  tree: { name: string; value: number; children: SunburstNode[] };
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <Skeleton className="h-[400px] sm:h-[600px] w-full rounded-lg" />
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("获取统计数据失败");
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("导出失败");
      const markdown = await res.text();

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vps-ip-stats.md";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      setExporting(true);
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error("导出失败");
      const markdown = await res.text();
      await navigator.clipboard.writeText(markdown);
      alert("已复制到剪贴板");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold">详细统计</h1>
            <ThemeToggle />
          </div>
          {stats && (
            <p className="text-sm text-muted-foreground mt-1">
              共 {stats.total} 台 · 数据更新于 {formatTimeAgo(stats.updatedAt)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={handleCopyMarkdown}
            disabled={exporting || !stats}
          >
            复制 Markdown
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || !stats}
          >
            导出 Markdown
          </Button>
          <Link href="/">
            <Button variant="outline">返回首页</Button>
          </Link>
        </div>
      </div>

      {loading && <StatsSkeleton />}

      {error && (
        <div className="flex items-center justify-center h-[400px] sm:h-[600px] text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && stats && (
        <SunburstChart
          data={stats.tree.children || []}
          total={stats.total}
        />
      )}
    </main>
  );
}
