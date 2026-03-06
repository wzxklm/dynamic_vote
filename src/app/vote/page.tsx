"use client";

import Link from "next/link";
import { VoteWizard } from "@/components/vote-form/vote-wizard";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function VotePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg flex items-center justify-between mb-4">
        <Link href="/">
          <Button variant="ghost" size="sm">← 返回首页</Button>
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-bold mb-6">提交投票</h1>
      <VoteWizard />
    </main>
  );
}
