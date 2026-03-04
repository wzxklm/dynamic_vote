"use client";

import { useState, useEffect } from "react";
import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OptionItem {
  id: string;
  value: string;
  isPreset: boolean;
  promoted: boolean;
}

export function StepOrg() {
  const store = useVoteStore();
  const [tab, setTab] = useState<string>("lookup");
  const [ipInput, setIpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    org: string;
    asn: string;
    country: string;
    city: string;
  } | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    fetch("/api/options?layer=org")
      .then((r) => r.json())
      .then((d) => setOptions(d.options || []))
      .catch(() => {});
  }, []);

  const doLookup = async () => {
    setLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const res = await fetch(`/api/ip-lookup?ip=${encodeURIComponent(ipInput)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "查询失败");
      }
      const data = await res.json();
      setLookupResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "查询失败";
      setLookupError(msg);
    } finally {
      setLoading(false);
    }
  };

  const confirmLookup = () => {
    if (!lookupResult) return;
    store.setField("org", lookupResult.org);
    store.setField("asn", lookupResult.asn);
    store.setField("ipLookupOrg", lookupResult.org);
    store.setField("ipLookupAsn", lookupResult.asn);
    store.setField("ipLookupCountry", lookupResult.country);
    store.setField("ipLookupCity", lookupResult.city);
    store.setField("customOrg", false);
    store.setField("customAsn", false);
    // Skip ASN step since we got it from lookup
    store.setStep(3);
  };

  const selectFromList = (value: string) => {
    store.setField("org", value);
    store.setField("customOrg", false);
    store.setField("asn", ""); // reset ASN when org changes
    store.nextStep();
  };

  const submitCustom = () => {
    if (!customInput.trim()) return;
    store.setField("org", customInput.trim());
    store.setField("customOrg", true);
    store.setField("asn", "");
    store.nextStep();
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="lookup">IP 查询</TabsTrigger>
        <TabsTrigger value="list">从列表选择</TabsTrigger>
      </TabsList>

      <TabsContent value="lookup" className="space-y-3 mt-3">
        <div className="flex gap-2">
          <Input
            placeholder="输入 IP 地址"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doLookup()}
          />
          <Button onClick={doLookup} disabled={!ipInput.trim() || loading}>
            {loading ? "查询中..." : "查询"}
          </Button>
        </div>

        {lookupError && (
          <div className="text-sm text-destructive">
            {lookupError}
            <button
              className="ml-2 underline"
              onClick={() => setTab("list")}
            >
              手动选择
            </button>
          </div>
        )}

        {lookupResult && (
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-sm"><strong>厂商：</strong>{lookupResult.org}</p>
            <p className="text-sm"><strong>ASN：</strong>{lookupResult.asn}</p>
            <p className="text-sm"><strong>地区：</strong>{lookupResult.country} {lookupResult.city}</p>
            <Button className="mt-2 w-full" onClick={confirmLookup}>
              确认使用
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="list" className="space-y-2 mt-3">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {options.map((opt) => (
            <Button
              key={opt.id}
              variant="outline"
              className="w-full justify-start"
              onClick={() => selectFromList(opt.value)}
            >
              {opt.value}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setShowCustom(true)}
          >
            其他（自定义输入）
          </Button>
        </div>

        {showCustom && (
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="输入厂商名称"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCustom()}
            />
            <Button onClick={submitCustom} disabled={!customInput.trim()}>
              确定
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
