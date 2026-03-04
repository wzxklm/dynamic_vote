"use client";

import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StepCount() {
  const store = useVoteStore();

  const handleNext = () => {
    if (store.count < 1 || store.count > 100) return;
    store.nextStep();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        相同配置的机器数量（1-100）：
      </p>
      <div className="space-y-2">
        <Label htmlFor="count">数量</Label>
        <Input
          id="count"
          type="number"
          min={1}
          max={100}
          value={store.count}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) store.setField("count", v);
          }}
        />
      </div>
      <Button
        className="w-full"
        onClick={handleNext}
        disabled={store.count < 1 || store.count > 100}
      >
        下一步
      </Button>
    </div>
  );
}
