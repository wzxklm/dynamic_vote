"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { SunburstChart as SunburstChartType } from "echarts/charts";
import { TooltipComponent, GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { SunburstNode } from "@/types";

echarts.use([
  SunburstChartType,
  TooltipComponent,
  GraphicComponent,
  CanvasRenderer,
]);

interface SunburstChartProps {
  data: SunburstNode[];
  total: number;
}

// Broader, more distinct palettes using HSL-based generation
const BLOCKED_HUES = [0, 25, 340, 15, 350, 30, 310, 45]; // reds, oranges, pinks, warm tones
const UNBLOCKED_HUES = [145, 185, 165, 210, 120, 195, 250, 170]; // greens, teals, cyans, blues

const ROOT_COLORS = {
  blocked: { dark: "#ef4444", light: "#dc2626" },
  unblocked: { dark: "#22c55e", light: "#16a34a" },
};

// Level config: r0/r as numbers (percent of radius), label width derived from ring width
const LEVEL_DEFS: Array<{
  r0: number; r: number; borderWidth: number; borderRadius: number;
  minAngle: number; fontSize: number; rotate?: 0 | "radial"; align?: "center";
}> = [
  { r0: 5,  r: 17, borderWidth: 3,   borderRadius: 6, minAngle: 5, fontSize: 14, rotate: 0, align: "center" },
  { r0: 17, r: 35, borderWidth: 2,   borderRadius: 4, minAngle: 5, fontSize: 12, rotate: "radial" },
  { r0: 35, r: 47, borderWidth: 2,   borderRadius: 3, minAngle: 5, fontSize: 12, rotate: "radial" },
  { r0: 47, r: 53, borderWidth: 1.5, borderRadius: 2, minAngle: 3, fontSize: 12, rotate: "radial" },
  { r0: 53, r: 73, borderWidth: 1.5, borderRadius: 2, minAngle: 3, fontSize: 12, rotate: "radial" },
  { r0: 73, r: 93, borderWidth: 1,   borderRadius: 2, minAngle: 3, fontSize: 12, rotate: "radial" },
];

function buildLevels(isDark: boolean, containerWidth: number) {
  const borderColor = isDark ? "#1a1a1a" : "#fff";
  const labelColor = isDark ? "#fff" : "#111";
  // ECharts sunburst radius percentages are relative to min(width, height) / 2
  const halfSize = containerWidth / 2;
  return [
    {},
    ...LEVEL_DEFS.map((def) => {
      const ringWidth = ((def.r - def.r0) / 100) * halfSize;
      return {
        r0: `${def.r0}%`,
        r: `${def.r}%`,
        itemStyle: { borderWidth: def.borderWidth, borderColor, borderRadius: def.borderRadius },
        label: {
          minAngle: def.minAngle,
          fontSize: def.fontSize,
          fontWeight: "bold" as const,
          color: labelColor,
          ...(def.rotate !== undefined ? { rotate: def.rotate } : {}),
          ...(def.align ? { align: def.align } : {}),
          ...(def.align ? {} : { overflow: "truncate" as const, width: Math.max(20, Math.floor(ringWidth)) }),
        },
      };
    }),
  ];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Generate a color for a node based on its branch (blocked/unblocked),
 * sibling index, and depth. Uses HSL for perceptually distinct variations.
 */
function generateColor(
  isBlocked: boolean,
  siblingIndex: number,
  depth: number,
  isDark: boolean,
): string {
  const hues = isBlocked ? BLOCKED_HUES : UNBLOCKED_HUES;
  const hue = hues[siblingIndex % hues.length];
  // Deeper levels: reduce saturation slightly, vary lightness
  const baseSat = isDark ? 72 : 65;
  const baseLight = isDark ? 55 : 48;
  const sat = Math.max(40, baseSat - depth * 4);
  const light = Math.min(70, baseLight + depth * 5);
  return hslToHex(hue, sat, light);
}

function assignColors(nodes: SunburstNode[], isDark: boolean): SunburstNode[] {
  return nodes.map((node) => {
    const isBlocked = node.name === "被封";
    const palette = isBlocked ? ROOT_COLORS.blocked : ROOT_COLORS.unblocked;
    const rootColor = isDark ? palette.dark : palette.light;

    const result: SunburstNode = {
      ...node,
      itemStyle: { color: rootColor },
    };
    if (node.children) {
      result.children = node.children.map((child, i) =>
        colorizeChild(child, isBlocked, i, 1, isDark),
      );
    }
    return result;
  });
}

function colorizeChild(
  node: SunburstNode,
  isBlocked: boolean,
  siblingIndex: number,
  depth: number,
  isDark: boolean,
): SunburstNode {
  const color = generateColor(isBlocked, siblingIndex, depth, isDark);
  const result: SunburstNode = {
    ...node,
    itemStyle: { color },
  };
  if (node.children) {
    result.children = node.children.map((child, i) =>
      colorizeChild(child, isBlocked, i, depth + 1, isDark),
    );
  }
  return result;
}

export default function SunburstChart({ data, total }: SunburstChartProps) {
  const chartRef = useRef<ReactEChartsCore>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setContainerWidth(width);
      }
      chartRef.current?.getEchartsInstance()?.resize();
    });
    ro.observe(container);
    setContainerWidth(container.clientWidth);

    return () => ro.disconnect();
  }, []);

  const coloredData = useMemo(() => assignColors(data, isDark), [data, isDark]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item" as const,
        backgroundColor: isDark
          ? "rgba(30,30,30,0.95)"
          : "rgba(255,255,255,0.95)",
        borderColor: isDark ? "#444" : "#ddd",
        borderRadius: 8,
        padding: [12, 16],
        textStyle: {
          color: isDark ? "#eee" : "#333",
          fontSize: 13,
        },
        formatter: (params: {
          name: string;
          value: number;
          treePathInfo: Array<{ name: string; value: number }>;
        }) => {
          const { name, value, treePathInfo } = params;
          if (!name || name === "root") return "";

          const parentValue =
            treePathInfo.length >= 2
              ? treePathInfo[treePathInfo.length - 2].value
              : total;

          const parentRatio =
            parentValue > 0 ? ((value / parentValue) * 100).toFixed(1) : "0.0";
          const totalRatio =
            total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";

          const path = treePathInfo
            .filter((p) => p.name && p.name !== "root")
            .map((p) => p.name)
            .join(" → ");

          return [
            `<div style="margin-bottom:4px;font-size:14px;font-weight:600">${name}</div>`,
            `<div style="color:${isDark ? "#aaa" : "#888"};font-size:11px;margin-bottom:8px">${path}</div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px"><span>数量</span><strong>${value} 台</strong></div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px"><span>占父级</span><strong>${parentRatio}%</strong></div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px"><span>占总计</span><strong>${totalRatio}%</strong></div>`,
          ].join("");
        },
      },
      graphic: [
        {
          type: "text",
          left: "center",
          top: "center",
          style: {
            text: `${total}\n台`,
            textAlign: "center" as const,
            fill: isDark ? "#e5e5e5" : "#333",
            fontSize: 16,
            fontWeight: "bold" as const,
            lineHeight: 20,
          },
        },
      ],
      series: [
        {
          type: "sunburst",
          data: coloredData,
          radius: ["5%", "93%"],
          center: ["50%", "50%"],
          sort: undefined,
          nodeClick: "rootToNode" as const,
          animationDurationUpdate: 500,
          label: {
            show: true,
          },
          emphasis: {
            focus: "ancestor",
            itemStyle: {
              shadowBlur: 16,
              shadowColor: "rgba(0,0,0,0.3)",
            },
          },
          levels: buildLevels(isDark, containerWidth),
        },
      ],
    }),
    [coloredData, total, isDark, containerWidth],
  );

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] sm:h-[600px] text-muted-foreground">
        暂无统计数据，快去投票吧！
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <ReactEChartsCore
        ref={chartRef}
        echarts={echarts}
        option={option}
        style={{ width: "100%", height: containerWidth || 600 }}
        notMerge={true}
      />
    </div>
  );
}
