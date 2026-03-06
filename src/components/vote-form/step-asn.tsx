"use client";

import { useState, useEffect } from "react";
import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OptionItem {
  id: string;
  value: string;
  isPreset: boolean;
  promoted: boolean;
}

export function StepAsn() {
  const store = useVoteStore();
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // If ASN was already set by IP lookup, auto-advance
  useEffect(() => {
    if (store.asn && store.ipLookupAsn) {
      // Already set from IP lookup, show confirmation
    }
  }, [store.asn, store.ipLookupAsn]);

  useEffect(() => {
    if (!store.org) return;
    fetch(`/api/options?layer=asn&parentKey=${encodeURIComponent(store.org)}`)
      .then((r) => {
        if (!r.ok) throw new Error("加载选项失败");
        return r.json();
      })
      .then((d) => {
        setOptions(d.options || []);
        setFetchError("");
      })
      .catch(() => setFetchError("加载选项失败，请重试"));
  }, [store.org]);

  const select = (value: string, isCustom = false) => {
    store.setField("asn", value);
    store.setField("customAsn", isCustom);
    store.nextStep();
  };

  const submitCustom = () => {
    if (!customInput.trim()) return;
    select(customInput.trim(), true);
  };

  // If already have ASN from IP lookup
  if (store.asn && store.ipLookupAsn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          IP 查询已获取 ASN：
        </p>
        <div className="rounded-lg border p-3">
          <p className="font-medium">{store.asn}</p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => store.nextStep()}>
            使用此 ASN
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              store.setField("asn", "");
              store.setField("ipLookupAsn", "");
            }}
          >
            重新选择
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-2">
        选择 <strong>{store.org}</strong> 下的 ASN：
      </p>
      {fetchError && (
        <div className="text-sm text-destructive mb-2">{fetchError}</div>
      )}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {options.map((opt) => (
          <Button
            key={opt.id}
            variant="outline"
            className="w-full justify-start"
            onClick={() => select(opt.value)}
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
            placeholder="输入 ASN（如 AS12345）"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCustom()}
          />
          <Button onClick={submitCustom} disabled={!customInput.trim()}>
            确定
          </Button>
        </div>
      )}
    </div>
  );
}
