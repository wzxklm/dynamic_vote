"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionItem } from "@/types";

interface OptionSelectorProps {
  options: OptionItem[];
  fetchError: string;
  placeholder: string;
  onSelect: (value: string, isCustom: boolean) => void;
}

export function OptionSelector({ options, fetchError, placeholder, onSelect }: OptionSelectorProps) {
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const submitCustom = () => {
    if (!customInput.trim()) return;
    onSelect(customInput.trim(), true);
  };

  return (
    <div className="space-y-2">
      {fetchError && (
        <div className="text-sm text-destructive mb-2">{fetchError}</div>
      )}
      <p className="text-xs text-muted-foreground">
        找不到匹配项？优先使用「自定义输入」，系统会通过 AI 自动归类到最合适的选项。
      </p>
      <div className="max-h-64 overflow-y-auto space-y-1">
        {!showCustom && (
          <Button
            variant="outline"
            className="w-full justify-start text-sm border-dashed border-primary text-primary"
            onClick={() => setShowCustom(true)}
          >
            ✏️ 自定义输入（推荐）
          </Button>
        )}
        {showCustom && (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder={placeholder}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCustom()}
            />
            <Button onClick={submitCustom} disabled={!customInput.trim()}>
              确定
            </Button>
          </div>
        )}
        {options.map((opt) => (
          <Button
            key={opt.id}
            variant="outline"
            className="w-full justify-start text-sm"
            onClick={() => onSelect(opt.value, false)}
          >
            {opt.value}
          </Button>
        ))}
      </div>
    </div>
  );
}
