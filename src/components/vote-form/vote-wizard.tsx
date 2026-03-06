"use client";

import { useVoteStore } from "@/lib/vote-store";
import { StepBlocked } from "./step-blocked";
import { StepOrg } from "./step-org";
import { StepAsn } from "./step-asn";
import { StepUsage } from "./step-usage";
import { StepProtocol } from "./step-protocol";
import { StepKeyConfig } from "./step-key-config";
import { StepCount } from "./step-count";
import { StepConfirm } from "./step-confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STEP_TITLES: Record<number, string> = {
  1: "是否被封",
  2: "选择厂商",
  3: "选择 ASN",
  4: "选择用途",
  5: "选择协议",
  6: "选择关键配置",
  7: "机器数量",
  8: "确认提交",
};

export function VoteWizard() {
  const { step, usage, prevStep } = useVoteStore();

  const totalSteps = usage === "website" ? 6 : 8;

  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepBlocked />;
      case 2:
        return <StepOrg />;
      case 3:
        return <StepAsn />;
      case 4:
        return <StepUsage />;
      case 5:
        return usage === "website" ? <StepCount /> : <StepProtocol />;
      case 6:
        return usage === "website" ? <StepConfirm /> : <StepKeyConfig />;
      case 7:
        return <StepCount />;
      case 8:
        return <StepConfirm />;
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    if (usage === "website") {
      if (step === 5) return "机器数量";
      if (step === 6) return "确认提交";
    }
    return STEP_TITLES[step] || "";
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{getStepTitle()}</CardTitle>
          <span className="text-sm text-muted-foreground">
            步骤 {step} / {totalSteps}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 mt-2">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {renderStep()}
        {step > 1 && (
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              if (usage === "website" && step === 5) {
                // Go back to step 4 (usage selection)
                useVoteStore.getState().setStep(4);
              } else {
                prevStep();
              }
            }}
          >
            ← 上一步
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
