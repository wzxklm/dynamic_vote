"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { SunburstNode } from "@/types";

const SunburstChart = dynamic(() => import("@/components/sunburst-chart"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[600px] text-gray-500">
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

export default function Home() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">VPS IP 封锁投票统计</h1>
          {stats && (
            <p className="text-sm text-gray-500 mt-1">
              共 {stats.total} 台 · 数据更新于 {formatTimeAgo(stats.updatedAt)}
            </p>
          )}
        </div>
        <div className="flex gap-3">
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

      {loading && (
        <div className="flex items-center justify-center h-[600px] text-gray-500">
          加载中...
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[600px] text-red-500">
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
