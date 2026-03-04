import { NextRequest, NextResponse } from "next/server";
import { voteSchema } from "@/lib/validators";
import { submitVote } from "@/lib/vote-service";
import { addToMatchQueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import {
  checkVoteRateLimit,
  validateFingerprint,
  checkFingerprintAntiForge,
} from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  // Zod validation
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return NextResponse.json(
      { error: firstError?.message || "参数校验失败" },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Fingerprint format check
  if (!validateFingerprint(data.fingerprint)) {
    return NextResponse.json(
      { error: "指纹格式无效" },
      { status: 400 }
    );
  }

  // Get client IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Rate limit check
  const rateLimit = await checkVoteRateLimit(ip, data.fingerprint);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", retryAfter: rateLimit.retryAfter },
      { status: 429 }
    );
  }

  // Fingerprint anti-forgery check
  const fpCheck = await checkFingerprintAntiForge(ip, data.fingerprint);
  if (!fpCheck.valid) {
    return NextResponse.json(
      { error: fpCheck.error || "指纹验证失败" },
      { status: 400 }
    );
  }

  // Submit vote
  const result = await submitVote(data);

  // Queue AI matching for custom fields (with retry)
  if (result.customFields.length > 0) {
    let allQueued = true;

    for (const field of result.customFields) {
      let queued = false;
      // Retry up to 3 times with 1s interval
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          queued = await addToMatchQueue({
            voteId: result.id,
            layer: field.layer,
            value: field.value,
            parentKey: field.parentKey,
            fingerprint: data.fingerprint,
          });
          if (queued) break;
        } catch {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      if (!queued) allQueued = false;
    }

    // If any queue failed, mark the vote
    if (!allQueued) {
      await prisma.vote.update({
        where: { id: result.id },
        data: { queueFailed: true },
      });
    }
  }

  return NextResponse.json(
    { id: result.id, resolved: result.resolved },
    { status: 201 }
  );
}
