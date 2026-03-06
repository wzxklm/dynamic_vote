"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useVoteStore } from "@/lib/vote-store";
import { getFingerprint } from "@/lib/fingerprint";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function StepConfirm() {
  const store = useVoteStore();
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    resolved: boolean;
  } | null>(null);

  const hasCustom =
    store.customOrg ||
    store.customAsn ||
    store.customProtocol ||
    store.customKeyConfig;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const fingerprint = await getFingerprint();

      const payload = {
        isBlocked: store.isBlocked,
        org: store.org,
        asn: store.asn,
        usage: store.usage,
        protocol: store.usage === "proxy" ? store.protocol : null,
        keyConfig: store.usage === "proxy" ? store.keyConfig : null,
        count: store.count,
        fingerprint,
      };

      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 429) {
          toast({
            variant: "destructive",
            title: "操作过于频繁",
            description: `请 ${err.retryAfter || 60} 秒后重试`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "提交失败",
            description: err.error || "未知错误",
          });
        }
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch {
      toast({
        variant: "destructive",
        title: "网络连接失败",
        description: "请检查网络后重试",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-2xl">✅</div>
        <p className="font-medium">投票提交成功！</p>
        <Badge variant={result.resolved ? "default" : "secondary"}>
          {result.resolved ? "已参与统计" : "等待系统审核"}
        </Badge>
        {!result.resolved && (
          <p className="text-xs text-muted-foreground">
            自定义选项需等待系统审核后才能参与统计
          </p>
        )}
        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1"
            onClick={() => {
              store.reset(true);
              setResult(null);
            }}
          >
            继续添加
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/")}
          >
            查看统计
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-2">请确认投票信息：</p>

      <div className="rounded-lg border p-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">是否被封</span>
          <span>{store.isBlocked ? "被封" : "未被封"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">厂商</span>
          <span>
            {store.org}
            {store.customOrg && (
              <Badge variant="secondary" className="ml-1 text-xs">
                自定义
              </Badge>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">ASN</span>
          <span>
            {store.asn}
            {store.customAsn && (
              <Badge variant="secondary" className="ml-1 text-xs">
                自定义
              </Badge>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">用途</span>
          <span>{store.usage === "proxy" ? "代理" : "网站"}</span>
        </div>
        {store.usage === "proxy" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">协议</span>
              <span>
                {store.protocol}
                {store.customProtocol && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    自定义
                  </Badge>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">关键配置</span>
              <span>
                {store.keyConfig}
                {store.customKeyConfig && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    自定义
                  </Badge>
                )}
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">数量</span>
          <span>{store.count} 台</span>
        </div>
      </div>

      {hasCustom && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          含自定义选项，提交后需等待系统审核才能参与统计。
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? "提交中..." : "确认提交"}
      </Button>
    </div>
  );
}
