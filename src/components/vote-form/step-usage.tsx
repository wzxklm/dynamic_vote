"use client";

import { useVoteStore } from "@/lib/vote-store";
import { Button } from "@/components/ui/button";

export function StepUsage() {
  const store = useVoteStore();

  const select = (usage: "proxy" | "website") => {
    store.setField("usage", usage);
    if (usage === "website") {
      store.setField("protocol", null);
      store.setField("keyConfig", null);
      // Skip to count step (step 5 in website mode)
      store.nextStep();
    } else {
      store.nextStep();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground mb-2">
        这台 VPS 的主要用途是什么？
      </p>
      <Button
        variant="outline"
        size="lg"
        className="w-full justify-start h-14 text-base"
        onClick={() => select("proxy")}
      >
        🔒 代理
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="w-full justify-start h-14 text-base"
        onClick={() => select("website")}
      >
        🌐 网站
      </Button>
    </div>
  );
}
