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
      <div className="max-h-64 overflow-y-auto space-y-1">
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
        {!showCustom && (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setShowCustom(true)}
          >
            其他（自定义输入）
          </Button>
        )}
      </div>

      {showCustom && (
        <div className="flex gap-2 mt-2">
          <Input
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
    </div>
  );
}
