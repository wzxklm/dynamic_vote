"use client";

import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";
import { useOptions } from "@/hooks/use-options";
import { OptionSelector } from "@/components/vote-form/option-selector";

export function StepAsn() {
  const store = useVoteStore();
  const { options, fetchError } = useOptions("asn", store.org);

  const select = (value: string, isCustom: boolean) => {
    store.setField("asn", value);
    store.setField("customAsn", isCustom);
    store.nextStep();
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
      <OptionSelector
        options={options}
        fetchError={fetchError}
        placeholder="输入 ASN（如 AS12345）"
        onSelect={select}
      />
    </div>
  );
}
