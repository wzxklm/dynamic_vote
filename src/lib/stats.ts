import { prisma, redis } from "./db";
import { SunburstNode, ExportRow } from "@/types";

const CACHE_KEY = "stats:sunburst";
const CACHE_TTL = 120; // 2 minutes

interface CachedStats {
  total: number;
  updatedAt: string;
  tree: SunburstNode;
}

/**
 * Get stats from cache or aggregate from DB
 */
export async function getStats(): Promise<CachedStats> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }
  const stats = await aggregateStats();
  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(stats));
  return stats;
}

/**
 * Aggregate stats from DB into sunburst tree
 */
async function aggregateStats(): Promise<CachedStats> {
  // Query 1: proxy votes - group by all 6 fields
  const proxyRows = await prisma.vote.groupBy({
    by: ["isBlocked", "org", "asn", "usage", "protocol", "keyConfig"],
    where: { resolved: true, usage: "proxy" },
    _sum: { count: true },
  });

  // Query 2: website votes - group by 4 fields
  const websiteRows = await prisma.vote.groupBy({
    by: ["isBlocked", "org", "asn", "usage"],
    where: { resolved: true, usage: "website" },
    _sum: { count: true },
  });

  let total = 0;

  // Build tree: isBlocked → org → asn → usage → protocol → keyConfig
  const blockedMap = new Map<boolean, Map<string, Map<string, Map<string, Map<string, Map<string, number>>>>>>();

  for (const row of proxyRows) {
    const count = row._sum.count || 0;
    // Skip rows with null protocol/keyConfig — indicates corrupt data for proxy votes
    if (row.protocol == null || row.keyConfig == null) continue;
    total += count;
    ensurePath(blockedMap, row.isBlocked, row.org, row.asn, row.usage, row.protocol, row.keyConfig, count);
  }

  // For website rows, we store them in the same structure but with no protocol/keyConfig children
  const websiteMap = new Map<boolean, Map<string, Map<string, number>>>();
  for (const row of websiteRows) {
    const count = row._sum.count || 0;
    total += count;

    if (!websiteMap.has(row.isBlocked)) websiteMap.set(row.isBlocked, new Map());
    const orgMap = websiteMap.get(row.isBlocked)!;
    if (!orgMap.has(row.org)) orgMap.set(row.org, new Map());
    const asnMap = orgMap.get(row.org)!;
    asnMap.set(row.asn, (asnMap.get(row.asn) || 0) + count);
  }

  // Build the tree
  const rootChildren: SunburstNode[] = [];

  // Collect all isBlocked values
  const allBlockedValues: boolean[] = [];
  Array.from(blockedMap.keys()).forEach((k) => { if (!allBlockedValues.includes(k)) allBlockedValues.push(k); });
  Array.from(websiteMap.keys()).forEach((k) => { if (!allBlockedValues.includes(k)) allBlockedValues.push(k); });

  for (const isBlocked of allBlockedValues) {
    const blockedName = isBlocked ? "被封" : "未被封";
    const orgChildren: SunburstNode[] = [];

    // Collect all orgs for this isBlocked value
    const allOrgsSet = new Map<string, true>();
    const proxyOrgs = blockedMap.get(isBlocked);
    if (proxyOrgs) Array.from(proxyOrgs.keys()).forEach((o) => allOrgsSet.set(o, true));
    const webOrgs = websiteMap.get(isBlocked);
    if (webOrgs) Array.from(webOrgs.keys()).forEach((o) => allOrgsSet.set(o, true));

    for (const org of Array.from(allOrgsSet.keys())) {
      const asnChildren: SunburstNode[] = [];

      // Collect all ASNs
      const allAsnsSet = new Map<string, true>();
      const proxyAsns = proxyOrgs?.get(org);
      if (proxyAsns) Array.from(proxyAsns.keys()).forEach((a) => allAsnsSet.set(a, true));
      const webAsns = webOrgs?.get(org);
      if (webAsns) Array.from(webAsns.keys()).forEach((a) => allAsnsSet.set(a, true));

      for (const asn of Array.from(allAsnsSet.keys())) {
        const usageChildren: SunburstNode[] = [];

        // Proxy usage
        const proxyUsages = proxyAsns?.get(asn);
        if (proxyUsages) {
          const proxyNode = buildProxyUsageNode(proxyUsages);
          if (proxyNode) usageChildren.push(proxyNode);
        }

        // Website usage
        const webCount = webAsns?.get(asn);
        if (webCount) {
          usageChildren.push({ name: "网站", value: webCount });
        }

        sortDesc(usageChildren);
        const asnValue = usageChildren.reduce((s, c) => s + c.value, 0);
        asnChildren.push({ name: asn, value: asnValue, children: usageChildren });
      }

      sortDesc(asnChildren);
      const orgValue = asnChildren.reduce((s, c) => s + c.value, 0);
      orgChildren.push({ name: org, value: orgValue, children: asnChildren });
    }

    sortDesc(orgChildren);
    const blockedValue = orgChildren.reduce((s, c) => s + c.value, 0);
    rootChildren.push({ name: blockedName, value: blockedValue, children: orgChildren });
  }

  sortDesc(rootChildren);

  const tree: SunburstNode = {
    name: "root",
    value: total,
    children: rootChildren,
  };

  return {
    total,
    updatedAt: new Date().toISOString(),
    tree,
  };
}

function buildProxyUsageNode(
  usageMap: Map<string, Map<string, Map<string, number>>>
): SunburstNode | null {
  // usageMap: usage -> protocol -> keyConfig -> count
  // For proxy, usage key is always "proxy"
  const proxyData = usageMap.get("proxy");
  if (!proxyData) return null;

  const protocolChildren: SunburstNode[] = [];

  for (const [protocol, keyConfigMap] of Array.from(proxyData.entries())) {
    const kcChildren: SunburstNode[] = [];
    for (const [keyConfig, count] of Array.from(keyConfigMap.entries())) {
      kcChildren.push({ name: keyConfig, value: count });
    }
    sortDesc(kcChildren);
    const protoValue = kcChildren.reduce((s, c) => s + c.value, 0);
    protocolChildren.push({ name: protocol, value: protoValue, children: kcChildren });
  }

  sortDesc(protocolChildren);
  const totalValue = protocolChildren.reduce((s, c) => s + c.value, 0);
  return { name: "代理", value: totalValue, children: protocolChildren };
}

function ensurePath(
  map: Map<boolean, Map<string, Map<string, Map<string, Map<string, Map<string, number>>>>>>,
  isBlocked: boolean,
  org: string,
  asn: string,
  usage: string,
  protocol: string,
  keyConfig: string,
  count: number
) {
  if (!map.has(isBlocked)) map.set(isBlocked, new Map());
  const orgMap = map.get(isBlocked)!;
  if (!orgMap.has(org)) orgMap.set(org, new Map());
  const asnMap = orgMap.get(org)!;
  if (!asnMap.has(asn)) asnMap.set(asn, new Map());
  const usageMap = asnMap.get(asn)!;
  if (!usageMap.has(usage)) usageMap.set(usage, new Map());
  const protoMap = usageMap.get(usage)!;
  if (!protoMap.has(protocol)) protoMap.set(protocol, new Map());
  const kcMap = protoMap.get(protocol)!;
  kcMap.set(keyConfig, (kcMap.get(keyConfig) || 0) + count);
}

function sortDesc(nodes: SunburstNode[]) {
  nodes.sort((a, b) => b.value - a.value);
}

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
            // Website: leaf at usage level
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
            // Proxy: expand protocol → keyConfig
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

function formatPercent(part: number, whole: number): string {
  if (whole === 0) return "0.0%";
  return ((part / whole) * 100).toFixed(1) + "%";
}

/**
 * Generate Markdown export table
 */
export function exportToMarkdown(tree: SunburstNode): string {
  const rows = treeToExportRows(tree);
  const total = tree.value;

  const lines: string[] = [
    `总投票数: ${total} 台`,
    "",
    "| 是否被封 | 厂商 | ASN | 用途 | 协议 | 关键配置 | 数量 | 占总比 |",
    "|----------|------|-----|------|------|----------|------|--------|",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.isBlocked} | ${row.org} | ${row.asn} | ${row.usage} | ${row.protocol} | ${row.keyConfig} | ${row.count} | ${row.totalRatio} |`
    );
  }

  return lines.join("\n");
}
