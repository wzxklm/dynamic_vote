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

export function StepKeyConfig() {
  const store = useVoteStore();
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    fetch("/api/options?layer=keyConfig")
      .then((r) => {
        if (!r.ok) throw new Error("加载选项失败");
        return r.json();
      })
      .then((d) => {
        setOptions(d.options || []);
        setFetchError("");
      })
      .catch(() => setFetchError("加载选项失败，请重试"));
  }, []);

  const select = (value: string, isCustom = false) => {
    store.setField("keyConfig", value);
    store.setField("customKeyConfig", isCustom);
    store.nextStep();
  };

  const submitCustom = () => {
    if (!customInput.trim()) return;
    select(customInput.trim(), true);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-2">选择关键配置：</p>
      {fetchError && (
        <div className="text-sm text-destructive mb-2">{fetchError}</div>
      )}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {options.map((opt) => (
          <Button
            key={opt.id}
            variant="outline"
            className="w-full justify-start text-sm"
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
            placeholder="输入关键配置"
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
