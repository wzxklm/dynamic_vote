"use client";

import { useCallback, useMemo, useRef } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { SunburstChart as SunburstChartType } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { SunburstNode } from "@/types";

echarts.use([SunburstChartType, TooltipComponent, CanvasRenderer]);

interface SunburstChartProps {
  data: SunburstNode[];
  total: number;
}

export default function SunburstChart({ data, total }: SunburstChartProps) {
  const chartRef = useRef<ReactEChartsCore>(null);

  const handleClick = useCallback(
    (params: { data?: SunburstNode; treePathInfo?: Array<{ name: string }> }) => {
      // ECharts sunburst supports drill-down natively via click
    },
    []
  );

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item" as const,
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

          return [
            `<strong>${name}</strong>`,
            `数量: ${value} 台`,
            `占父级: ${parentRatio}%`,
            `占总计: ${totalRatio}%`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "sunburst",
          data: data,
          radius: ["0%", "95%"],
          sort: undefined,
          emphasis: {
            focus: "ancestor",
          },
          levels: [
            {},
            {
              r0: "10%",
              r: "28%",
              itemStyle: { borderWidth: 2 },
              label: { fontSize: 14, fontWeight: "bold" as const },
            },
            {
              r0: "28%",
              r: "44%",
              itemStyle: { borderWidth: 2 },
              label: { fontSize: 12 },
            },
            {
              r0: "44%",
              r: "58%",
              itemStyle: { borderWidth: 1 },
              label: { fontSize: 11 },
            },
            {
              r0: "58%",
              r: "70%",
              itemStyle: { borderWidth: 1 },
              label: { fontSize: 10 },
            },
            {
              r0: "70%",
              r: "82%",
              itemStyle: { borderWidth: 1 },
              label: { fontSize: 9 },
            },
            {
              r0: "82%",
              r: "95%",
              itemStyle: { borderWidth: 1 },
              label: {
                fontSize: 8,
                position: "outside" as const,
                padding: 3,
                silent: false,
              },
            },
          ],
        },
      ],
    }),
    [data, total]
  );

  const onEvents = useMemo(() => ({ click: handleClick }), [handleClick]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] text-gray-500">
        暂无统计数据，快去投票吧！
      </div>
    );
  }

  return (
    <ReactEChartsCore
      ref={chartRef}
      echarts={echarts}
      option={option}
      style={{ height: "600px", width: "100%" }}
      onEvents={onEvents}
      notMerge={true}
    />
  );
}
