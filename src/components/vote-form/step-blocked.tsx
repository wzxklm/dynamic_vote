"use client";

import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";

export function StepBlocked() {
  const { setField, nextStep } = useVoteStore();

  const select = (blocked: boolean) => {
    setField("isBlocked", blocked);
    nextStep();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground mb-2">
        您的 VPS IP 是否被封锁？
      </p>
      <Button
        variant="outline"
        size="lg"
        className="w-full justify-start h-14 text-base"
        onClick={() => select(true)}
      >
        🚫 被封
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="w-full justify-start h-14 text-base"
        onClick={() => select(false)}
      >
        ✅ 未被封
      </Button>
    </div>
  );
}
