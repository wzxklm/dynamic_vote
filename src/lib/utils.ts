import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { NextRequest, NextResponse } from "next/server";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function formatPercent(part: number, whole: number): string {
  if (whole === 0) return "0.0%";
  return ((part / whole) * 100).toFixed(1) + "%";
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function errorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}
