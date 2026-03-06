export interface VoteInput {
  isBlocked: boolean;
  org: string;
  asn: string;
  usage: "proxy" | "website";
  protocol: string | null;
  keyConfig: string | null;
  count: number;
  fingerprint: string;
}

export interface IpLookupResult {
  org: string;
  asn: string;
  country: string;
  city: string;
}

export interface SunburstNode {
  name: string;
  value: number;
  children?: SunburstNode[];
}

export interface StatsResponse {
  total: number;
  updatedAt: string;
  tree: SunburstNode;
}

export interface OptionItem {
  id: string;
  value: string;
  isPreset: boolean;
  promoted: boolean;
}

export interface ExportRow {
  isBlocked: string;
  org: string;
  asn: string;
  usage: string;
  protocol: string;
  keyConfig: string;
  count: number;
  totalRatio: string;
}

export interface ReportResponse {
  report: string;
  generatedAt: string;
  totalVotesAtGeneration: number;
  currentTotalVotes?: number;
}
