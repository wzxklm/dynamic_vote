"use client";

import { useVoteStore } from "@/lib/vote-store";
import { useOptions } from "@/hooks/use-options";
import { OptionSelector } from "@/components/vote-form/option-selector";

export function StepProtocol() {
  const store = useVoteStore();
  const { options, fetchError } = useOptions("protocol");

  const select = (value: string, isCustom: boolean) => {
    store.setField("protocol", value);
    store.setField("customProtocol", isCustom);
    store.nextStep();
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-2">选择代理协议：</p>
      <OptionSelector
        options={options}
        fetchError={fetchError}
        placeholder="输入协议名称"
        onSelect={select}
      />
    </div>
  );
}
