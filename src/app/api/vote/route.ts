export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { voteSchema } from "@/lib/validators";
import { submitVote } from "@/lib/vote-service";
import { addToMatchQueue } from "@/lib/queue";
import { prisma } from "@/lib/db";
import {
  checkVoteRateLimit,
  validateFingerprint,
  checkFingerprintAntiForge,
  validateRequestHeaders,
} from "@/lib/rate-limit";
import { getClientIp, errorResponse } from "@/lib/utils";

export async function POST(request: NextRequest) {
  console.log("[API] POST /vote");

  // Request header validation (detect non-browser clients)
  const headerCheck = validateRequestHeaders(request.headers);
  if (!headerCheck.valid) {
    console.log(`[API] POST /vote rejected: ${headerCheck.error}`);
    return errorResponse(headerCheck.error || "请求特征异常", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体格式错误", 400);
  }

  // Zod validation
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return errorResponse(firstError?.message || "参数校验失败", 400);
  }

  const data = parsed.data;

  // Fingerprint format check
  if (!validateFingerprint(data.fingerprint)) {
    return errorResponse("指纹格式无效", 400);
  }

  // Get client IP
  // Limitation: falls back to "unknown" when behind proxies that don't set
  // x-forwarded-for / x-real-ip headers, which means rate-limiting by IP
  // won't work correctly in that scenario.
  const ip = getClientIp(request);

  // Rate limit check
  const rateLimit = await checkVoteRateLimit(ip, data.fingerprint);
  if (!rateLimit.allowed) {
    console.log(`[RateLimit] vote blocked ip=${ip}`);
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", retryAfter: rateLimit.retryAfter },
      { status: 429 }
    );
  }

  // Fingerprint anti-forgery check
  const fpCheck = await checkFingerprintAntiForge(ip, data.fingerprint);
  if (!fpCheck.valid) {
    return errorResponse(fpCheck.error || "指纹验证失败", 400);
  }

  // Submit vote
  try {
    const result = await submitVote(data);

    // Queue AI matching for custom fields (single attempt; orphan recovery handles retries)
    if (result.customFields.length > 0) {
      let allQueued = true;

      for (const field of result.customFields) {
        let queued = false;
        try {
          queued = await addToMatchQueue({
            voteId: result.id,
            layer: field.layer,
            value: field.value,
            parentKey: field.parentKey,
            fingerprint: data.fingerprint,
          });
        } catch {
          // Queue unavailable — orphan recovery job will retry asynchronously
        }

        if (!queued) {
          console.warn(`[Vote] queue failed voteId=${result.id} layer=${field.layer}`);
          allQueued = false;
        }
      }

      // If any queue failed, mark the vote so orphan recovery can pick it up
      if (!allQueued) {
        await prisma.vote.update({
          where: { id: result.id },
          data: { queueFailed: true },
        });
      }
    }

    console.log(`[API] POST /vote → 201 id=${result.id} resolved=${result.resolved} customFields=${result.customFields.length}`);
    return NextResponse.json(
      { id: result.id, resolved: result.resolved },
      { status: 201 }
    );
  } catch (error) {
    console.error("Vote submission failed:", error);
    return errorResponse("服务器内部错误", 500);
  }
}
