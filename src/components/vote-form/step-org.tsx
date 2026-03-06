"use client";

import { useState } from "react";
import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOptions } from "@/hooks/use-options";
import { OptionSelector } from "@/components/vote-form/option-selector";

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
  const { options, fetchError } = useOptions("org");

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

  const selectFromList = (value: string, isCustom: boolean) => {
    store.setField("org", value);
    store.setField("customOrg", isCustom);
    store.setField("asn", ""); // reset ASN when org changes
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
        <OptionSelector
          options={options}
          fetchError={fetchError}
          placeholder="输入厂商名称"
          onSelect={selectFromList}
        />
      </TabsContent>
    </Tabs>
  );
}
