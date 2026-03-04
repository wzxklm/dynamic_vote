interface PresetOption {
  layer: string;
  value: string;
  parentKey: string;
}

export const presetOptions: PresetOption[] = [
  // ── org（厂商）──────────────────────────────
  { layer: "org", value: "Vultr", parentKey: "" },
  { layer: "org", value: "Hostinger", parentKey: "" },
  { layer: "org", value: "OVH", parentKey: "" },
  { layer: "org", value: "DigitalOcean", parentKey: "" },
  { layer: "org", value: "Linode (Akamai)", parentKey: "" },
  { layer: "org", value: "AWS", parentKey: "" },
  { layer: "org", value: "Azure", parentKey: "" },
  { layer: "org", value: "GCP", parentKey: "" },
  { layer: "org", value: "阿里云", parentKey: "" },
  { layer: "org", value: "腾讯云", parentKey: "" },
  { layer: "org", value: "搬瓦工 (IT7)", parentKey: "" },
  { layer: "org", value: "RackNerd (HostPapa)", parentKey: "" },
  { layer: "org", value: "DMIT", parentKey: "" },
  { layer: "org", value: "CloudCone", parentKey: "" },

  // ── asn（每个厂商对应的主要 ASN）──────────────
  { layer: "asn", value: "AS20473", parentKey: "Vultr" },
  { layer: "asn", value: "AS47583", parentKey: "Hostinger" },
  { layer: "asn", value: "AS16276", parentKey: "OVH" },
  { layer: "asn", value: "AS14061", parentKey: "DigitalOcean" },
  { layer: "asn", value: "AS63949", parentKey: "Linode (Akamai)" },
  { layer: "asn", value: "AS14618", parentKey: "AWS" },
  { layer: "asn", value: "AS8075", parentKey: "Azure" },
  { layer: "asn", value: "AS15169", parentKey: "GCP" },
  { layer: "asn", value: "AS45102", parentKey: "阿里云" },
  { layer: "asn", value: "AS132203", parentKey: "腾讯云" },
  { layer: "asn", value: "AS25820", parentKey: "搬瓦工 (IT7)" },
  { layer: "asn", value: "AS36352", parentKey: "RackNerd (HostPapa)" },
  { layer: "asn", value: "AS54574", parentKey: "DMIT" },
  { layer: "asn", value: "AS54643", parentKey: "CloudCone" },

  // ── protocol（代理协议）──────────────────────
  // Shadowsocks 系列
  { layer: "protocol", value: "Shadowsocks", parentKey: "" },
  { layer: "protocol", value: "ShadowsocksR", parentKey: "" },
  { layer: "protocol", value: "Shadowsocks-2022", parentKey: "" },
  // VMess 系列
  { layer: "protocol", value: "VMess+TCP", parentKey: "" },
  { layer: "protocol", value: "VMess+WS+TLS", parentKey: "" },
  { layer: "protocol", value: "VMess+gRPC+TLS", parentKey: "" },
  { layer: "protocol", value: "VMess+HTTP/2", parentKey: "" },
  // VLESS 系列
  { layer: "protocol", value: "VLESS+TCP+TLS", parentKey: "" },
  { layer: "protocol", value: "VLESS+WS+TLS", parentKey: "" },
  { layer: "protocol", value: "VLESS+gRPC+TLS", parentKey: "" },
  { layer: "protocol", value: "VLESS+XTLS-Vision", parentKey: "" },
  { layer: "protocol", value: "VLESS+Reality+Vision", parentKey: "" },
  { layer: "protocol", value: "VLESS+Reality+gRPC", parentKey: "" },
  // Trojan 系列
  { layer: "protocol", value: "Trojan+TLS", parentKey: "" },
  { layer: "protocol", value: "Trojan+WS+TLS", parentKey: "" },
  { layer: "protocol", value: "Trojan+gRPC+TLS", parentKey: "" },
  { layer: "protocol", value: "Trojan+Reality", parentKey: "" },
  // QUIC/UDP 协议
  { layer: "protocol", value: "Hysteria", parentKey: "" },
  { layer: "protocol", value: "Hysteria2", parentKey: "" },
  { layer: "protocol", value: "TUIC v5", parentKey: "" },
  { layer: "protocol", value: "Juicity", parentKey: "" },
  // VPN 协议
  { layer: "protocol", value: "WireGuard", parentKey: "" },
  { layer: "protocol", value: "AmneziaWG", parentKey: "" },
  { layer: "protocol", value: "OpenVPN", parentKey: "" },
  { layer: "protocol", value: "IPSec/IKEv2", parentKey: "" },
  // 伪装/混淆类
  { layer: "protocol", value: "SS+Shadow-TLS v3", parentKey: "" },
  { layer: "protocol", value: "NaiveProxy", parentKey: "" },
  { layer: "protocol", value: "Brook", parentKey: "" },
  { layer: "protocol", value: "Snell", parentKey: "" },
  // 其他
  { layer: "protocol", value: "SSH 隧道", parentKey: "" },
  { layer: "protocol", value: "SoftEther VPN", parentKey: "" },
  { layer: "protocol", value: "Mieru", parentKey: "" },

  // ── keyConfig（关键配置）─────────────────────
  // TLS 伪装
  { layer: "keyConfig", value: "TLS 指纹伪装为 Chrome", parentKey: "" },
  { layer: "keyConfig", value: "TLS 指纹伪装为 Firefox", parentKey: "" },
  // CDN 中转
  { layer: "keyConfig", value: "使用 Cloudflare CDN 中转", parentKey: "" },
  { layer: "keyConfig", value: "使用其他 CDN 中转", parentKey: "" },
  // 端口策略
  { layer: "keyConfig", value: "使用 443 端口", parentKey: "" },
  { layer: "keyConfig", value: "使用非常规端口", parentKey: "" },
  { layer: "keyConfig", value: "端口跳跃（Port Hopping）", parentKey: "" },
  // 连接方式
  { layer: "keyConfig", value: "直连无伪装", parentKey: "" },
  { layer: "keyConfig", value: "开启 Mux 多路复用", parentKey: "" },
  // 使用人数
  { layer: "keyConfig", value: "独享（仅自己）", parentKey: "" },
  { layer: "keyConfig", value: "少量共享（2-5人）", parentKey: "" },
  { layer: "keyConfig", value: "多人共享（6-20人）", parentKey: "" },
  { layer: "keyConfig", value: "机场节点（>20人）", parentKey: "" },
];
