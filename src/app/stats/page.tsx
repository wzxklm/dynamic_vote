"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { SunburstNode } from "@/types";

const SunburstChart = dynamic(() => import("@/components/sunburst-chart"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] sm:h-[900px] text-muted-foreground">
      加载图表中...
    </div>
  ),
});

interface StatsData {
  total: number;
  updatedAt: string;
  tree: { name: string; value: number; children: SunburstNode[] };
}

interface ExportRow {
  isBlocked: string;
  org: string;
  asn: string;
  usage: string;
  protocol: string;
  keyConfig: string;
  count: number;
  parentRatio: string;
  totalRatio: string;
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

function formatPercent(part: number, whole: number): string {
  if (whole === 0) return "0.0%";
  return ((part / whole) * 100).toFixed(1) + "%";
}

function treeToRows(tree: { name: string; value: number; children?: SunburstNode[] }): ExportRow[] {
  const total = tree.value;
  const rows: ExportRow[] = [];
  if (!tree.children) return rows;

  for (const blockedNode of tree.children) {
    if (!blockedNode.children) continue;
    for (const orgNode of blockedNode.children) {
      if (!orgNode.children) continue;
      for (const asnNode of orgNode.children) {
        if (!asnNode.children) continue;
        for (const usageNode of asnNode.children) {
          if (usageNode.name === "网站") {
            rows.push({
              isBlocked: blockedNode.name, org: orgNode.name, asn: asnNode.name,
              usage: "网站", protocol: "-", keyConfig: "-",
              count: usageNode.value,
              parentRatio: formatPercent(usageNode.value, asnNode.value),
              totalRatio: formatPercent(usageNode.value, total),
            });
          } else if (usageNode.children) {
            for (const protoNode of usageNode.children) {
              if (!protoNode.children) continue;
              for (const kcNode of protoNode.children) {
                rows.push({
                  isBlocked: blockedNode.name, org: orgNode.name, asn: asnNode.name,
                  usage: "代理", protocol: protoNode.name, keyConfig: kcNode.name,
                  count: kcNode.value,
                  parentRatio: formatPercent(kcNode.value, protoNode.value),
                  totalRatio: formatPercent(kcNode.value, total),
                });
              }
            }
          }
        }
      }
    }
  }
  return rows;
}

function StatsTable({ tree }: { tree: StatsData["tree"] }) {
  const rows = useMemo(() => treeToRows(tree), [tree]);

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
              <th className="px-3 py-2 text-right font-medium">占父级比</th>
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
                <td className="px-3 py-2 text-right">{row.parentRatio}</td>
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
      <Skeleton className="h-[600px] sm:h-[900px] w-full rounded-lg" />
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
        <div className="flex items-center justify-center h-[600px] sm:h-[900px] text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && stats && (
        <>
          <SunburstChart
            data={stats.tree.children || []}
            total={stats.total}
          />
          <StatsTable tree={stats.tree} />
        </>
      )}
    </main>
  );
}
