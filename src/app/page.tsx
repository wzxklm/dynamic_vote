"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatTimeAgo } from "@/lib/utils";
import { useStats } from "@/hooks/use-stats";

const SunburstChart = dynamic(() => import("@/components/sunburst-chart"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[400px] sm:h-[600px] text-muted-foreground">
      加载图表中...
    </div>
  ),
});

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <Skeleton className="h-[400px] sm:h-[600px] w-full rounded-lg" />
    </div>
  );
}

export default function Home() {
  const { stats, loading, error } = useStats();

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">
      {loading && <HomeSkeleton />}

      {!loading && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold">
                VPS IP 封锁投票统计
              </h1>
              <ThemeToggle />
            </div>
            {stats && (
              <p className="text-sm text-muted-foreground mt-1">
                共 {stats.total} 台 · 数据更新于{" "}
                {formatTimeAgo(stats.updatedAt)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 shrink-0">
            <Link href="/vote">
              <Button>参与投票</Button>
            </Link>
            <Link href="/stats">
              <Button variant="outline">详细统计</Button>
            </Link>
            <Link href="/report">
              <Button variant="outline">AI 报告</Button>
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[400px] sm:h-[600px] text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && stats && (
        <div className="text-sm text-muted-foreground mb-3 rounded-lg border border-dashed p-3 space-y-1">
          <p>
            <strong>旭日图阅读指南：</strong>从内到外依次为 封锁状态 → 厂商 →
            ASN → 用途 → 协议 → 关键配置。
          </p>
          <p>鼠标悬停可查看数量与占比，点击扇区可聚焦展开该分支。</p>
        </div>
      )}

      {!loading && !error && stats && (
        <SunburstChart data={stats.tree.children || []} total={stats.total} />
      )}
    </main>
  );
}
