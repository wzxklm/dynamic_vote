"use client";

import { useVoteStore } from "@/lib/vote-store";
import { useOptions } from "@/hooks/use-options";
import { OptionSelector } from "@/components/vote-form/option-selector";

export function StepKeyConfig() {
  const store = useVoteStore();
  const { options, fetchError } = useOptions("keyConfig");

  const select = (value: string, isCustom: boolean) => {
    store.setField("keyConfig", value);
    store.setField("customKeyConfig", isCustom);
    store.nextStep();
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-2">选择关键配置：</p>
      <OptionSelector
        options={options}
        fetchError={fetchError}
        placeholder="输入关键配置"
        onSelect={select}
      />
    </div>
  );
}
