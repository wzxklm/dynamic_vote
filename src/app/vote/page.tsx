"use client";

import { VoteWizard } from "@/components/vote-form/vote-wizard";
import { Toaster } from "@/components/ui/toaster";

export default function VotePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-6">提交投票</h1>
      <VoteWizard />
      <Toaster />
    </main>
  );
}
