import { prisma, redis } from "./db";
import { SunburstNode } from "@/types";
export { treeToExportRows } from "./tree-utils";
import { treeToExportRows } from "./tree-utils";

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
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis unavailable — fall through to DB aggregation
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
    const count = row._sum.count ?? 0;
    // Skip rows with null protocol/keyConfig — indicates corrupt data for proxy votes
    if (row.protocol == null || row.keyConfig == null) continue;
    total += count;
    ensurePath(blockedMap, row.isBlocked, row.org, row.asn, row.usage, row.protocol, row.keyConfig, count);
  }

  // For website rows, we store them in the same structure but with no protocol/keyConfig children
  const websiteMap = new Map<boolean, Map<string, Map<string, number>>>();
  for (const row of websiteRows) {
    const count = row._sum.count ?? 0;
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
  const allBlockedValues = new Set<boolean>();
  Array.from(blockedMap.keys()).forEach((k) => allBlockedValues.add(k));
  Array.from(websiteMap.keys()).forEach((k) => allBlockedValues.add(k));

  for (const isBlocked of Array.from(allBlockedValues)) {
    const blockedName = isBlocked ? "被封" : "未被封";
    const orgChildren: SunburstNode[] = [];

    // Collect all orgs for this isBlocked value
    const allOrgsSet = new Set<string>();
    const proxyOrgs = blockedMap.get(isBlocked);
    if (proxyOrgs) Array.from(proxyOrgs.keys()).forEach((o) => allOrgsSet.add(o));
    const webOrgs = websiteMap.get(isBlocked);
    if (webOrgs) Array.from(webOrgs.keys()).forEach((o) => allOrgsSet.add(o));

    for (const org of Array.from(allOrgsSet)) {
      const asnChildren: SunburstNode[] = [];

      // Collect all ASNs
      const allAsnsSet = new Set<string>();
      const proxyAsns = proxyOrgs?.get(org);
      if (proxyAsns) Array.from(proxyAsns.keys()).forEach((a) => allAsnsSet.add(a));
      const webAsns = webOrgs?.get(org);
      if (webAsns) Array.from(webAsns.keys()).forEach((a) => allAsnsSet.add(a));

      for (const asn of Array.from(allAsnsSet)) {
        const usageChildren: SunburstNode[] = [];

        // Proxy usage
        const proxyUsages = proxyAsns?.get(asn);
        if (proxyUsages) {
          const proxyNode = buildProxyUsageNode(proxyUsages);
          if (proxyNode) usageChildren.push(proxyNode);
        }

        // Website usage
        const webCount = webAsns?.get(asn);
        if (webCount != null && webCount > 0) {
          usageChildren.push({ name: "网站", value: webCount });
        }

        sortDesc(usageChildren);
        const asnValue = sumValues(usageChildren);
        asnChildren.push({ name: asn, value: asnValue, children: usageChildren });
      }

      sortDesc(asnChildren);
      const orgValue = sumValues(asnChildren);
      orgChildren.push({ name: org, value: orgValue, children: asnChildren });
    }

    sortDesc(orgChildren);
    const blockedValue = sumValues(orgChildren);
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
    const protoValue = sumValues(kcChildren);
    protocolChildren.push({ name: protocol, value: protoValue, children: kcChildren });
  }

  sortDesc(protocolChildren);
  const totalValue = sumValues(protocolChildren);
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

function sumValues(nodes: SunburstNode[]): number {
  return nodes.reduce((s, c) => s + c.value, 0);
}

function sortDesc(nodes: SunburstNode[]) {
  nodes.sort((a, b) => b.value - a.value);
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
