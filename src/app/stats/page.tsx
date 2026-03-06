"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatsResponse } from "@/types";
import { formatTimeAgo } from "@/lib/utils";
import { treeToExportRows } from "@/lib/tree-utils";
import { useStats } from "@/hooks/use-stats";

function StatsTable({ tree }: { tree: StatsResponse["tree"] }) {
  const rows = useMemo(() => treeToExportRows(tree), [tree]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">详细数据表</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">是否被封</th>
              <th className="px-3 py-2 text-left font-medium">厂商</th>
              <th className="px-3 py-2 text-left font-medium">ASN</th>
              <th className="px-3 py-2 text-left font-medium">用途</th>
              <th className="px-3 py-2 text-left font-medium">协议</th>
              <th className="px-3 py-2 text-left font-medium">关键配置</th>
              <th className="px-3 py-2 text-right font-medium">数量</th>
              <th className="px-3 py-2 text-right font-medium">占总比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <span className={row.isBlocked === "被封" ? "text-destructive font-medium" : "text-green-600 dark:text-green-400 font-medium"}>
                    {row.isBlocked}
                  </span>
                </td>
                <td className="px-3 py-2">{row.org}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.asn}</td>
                <td className="px-3 py-2">{row.usage}</td>
                <td className="px-3 py-2">{row.protocol}</td>
                <td className="px-3 py-2">{row.keyConfig}</td>
                <td className="px-3 py-2 text-right font-medium">{row.count}</td>
                <td className="px-3 py-2 text-right">{row.totalRatio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
      <Skeleton className="h-[300px] w-full rounded-lg" />
    </div>
  );
}

export default function StatsPage() {
  const { stats, loading, error } = useStats();
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);

  const fetchMarkdown = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/export");
    if (!res.ok) throw new Error("导出失败");
    return res.text();
  }, []);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      const markdown = await fetchMarkdown();

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
  }, [fetchMarkdown]);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      setCopying(true);
      const markdown = await fetchMarkdown();
      await navigator.clipboard.writeText(markdown);
      alert("已复制到剪贴板");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCopying(false);
    }
  }, [fetchMarkdown]);

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
            disabled={copying || !stats}
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
        <div className="flex items-center justify-center h-[300px] text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && stats && (
        <StatsTable tree={stats.tree} />
      )}
    </main>
  );
}
