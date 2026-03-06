import { SunburstNode, ExportRow } from "@/types";
import { formatPercent } from "./utils";

/**
 * Flatten tree into export rows with ratios
 */
export function treeToExportRows(tree: SunburstNode): ExportRow[] {
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
              isBlocked: blockedNode.name,
              org: orgNode.name,
              asn: asnNode.name,
              usage: "网站",
              protocol: "-",
              keyConfig: "-",
              count: usageNode.value,
              totalRatio: formatPercent(usageNode.value, total),
            });
          } else if (usageNode.children) {
            for (const protoNode of usageNode.children) {
              if (!protoNode.children) continue;
              for (const kcNode of protoNode.children) {
                rows.push({
                  isBlocked: blockedNode.name,
                  org: orgNode.name,
                  asn: asnNode.name,
                  usage: "代理",
                  protocol: protoNode.name,
                  keyConfig: kcNode.name,
                  count: kcNode.value,
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
