import { prisma } from "./db";
import { redis } from "./db";
import type { VoteFormData } from "./validators";

// --- Types ---

interface VoteResult {
  id: string;
  resolved: boolean;
  customFields: { layer: string; value: string; parentKey: string }[];
}

// --- Field classification ---

/**
 * Get the list of fields to check for a vote.
 * parentKey follows the schema convention:
 * - org: "" (global)
 * - asn: org value
 * - protocol: "" (global)
 * - keyConfig: "" (global)
 */
export function getFieldsToCheck(data: {
  org: string;
  asn: string;
  usage: string;
  protocol?: string | null;
  keyConfig?: string | null;
}) {
  const fields = [
    { layer: "org", value: data.org, parentKey: "" },
    { layer: "asn", value: data.asn, parentKey: data.org },
  ];

  if (data.usage === "proxy") {
    if (data.protocol) {
      fields.push({ layer: "protocol", value: data.protocol, parentKey: "" });
    }
    if (data.keyConfig) {
      fields.push({ layer: "keyConfig", value: data.keyConfig, parentKey: "" });
    }
  }

  return fields;
}

/**
 * Check if a value is a known option (isPreset=true or promoted=true)
 */
async function isKnownOption(
  layer: string,
  value: string,
  parentKey: string
): Promise<boolean> {
  const option = await prisma.dynamicOption.findUnique({
    where: {
      layer_value_parentKey: { layer, value, parentKey },
    },
  });

  if (!option) return false;
  return option.isPreset || option.promoted;
}

// --- Vote submission ---

/**
 * Process a vote submission:
 * 1. Create Vote record
 * 2. Classify each field (known vs custom)
 * 3. Set resolved status
 * Returns customFields for the caller to queue AI matching.
 */
export async function submitVote(data: VoteFormData): Promise<VoteResult> {
  const vote = await prisma.vote.create({
    data: {
      isBlocked: data.isBlocked,
      org: data.org,
      asn: data.asn,
      usage: data.usage,
      protocol: data.protocol,
      keyConfig: data.keyConfig,
      count: data.count,
      fingerprint: data.fingerprint,
      resolved: false,
    },
  });

  const fieldsToCheck = getFieldsToCheck(data);
  const customFields: { layer: string; value: string; parentKey: string }[] = [];

  for (const field of fieldsToCheck) {
    const isKnown = await isKnownOption(field.layer, field.value, field.parentKey);
    if (!isKnown) {
      customFields.push(field);
    }
  }

  if (customFields.length === 0) {
    await prisma.vote.update({
      where: { id: vote.id },
      data: { resolved: true },
    });
    return { id: vote.id, resolved: true, customFields: [] };
  }

  return { id: vote.id, resolved: false, customFields };
}

// --- Deduplication ---

/**
 * Deduplicate count using OptionContributor unique constraint.
 * If contributor already exists (same option + fingerprint), silently skip.
 * Otherwise, increment submitCount.
 */
export async function deduplicateCount(
  optionId: string,
  fingerprint: string
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.optionContributor.create({
        data: { optionId, fingerprint },
      });
      await tx.dynamicOption.update({
        where: { id: optionId },
        data: { submitCount: { increment: 1 } },
      });
    });
  } catch (error: unknown) {
    // P2002 = unique constraint violation → already contributed, skip
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

// --- Option promotion ---

/**
 * Check if an option should be promoted (submitCount >= 3).
 * If promoted, clear cache and try to resolve related votes.
 */
export async function promoteOptionIfNeeded(optionId: string): Promise<void> {
  const option = await prisma.dynamicOption.findUnique({
    where: { id: optionId },
  });

  if (!option || option.promoted || option.submitCount < 3) return;

  // Promote the option
  await prisma.dynamicOption.update({
    where: { id: optionId },
    data: { promoted: true },
  });

  // Clear option cache for this layer
  await clearOptionCache(option.layer, option.parentKey);

  // Find all unresolved votes referencing this option value
  const layerField = option.layer as "org" | "asn" | "protocol" | "keyConfig";
  const whereClause: Record<string, unknown> = {
    [layerField]: option.value,
    resolved: false,
  };

  const affectedVotes = await prisma.vote.findMany({
    where: whereClause,
    select: { id: true },
  });

  // Try to resolve each affected vote
  for (const vote of affectedVotes) {
    await tryResolveVote(vote.id);
  }
}

// --- Vote resolution ---

/**
 * Try to resolve a vote by checking if all its fields reference known options.
 * Called after AI matching or option promotion.
 */
export async function tryResolveVote(voteId: string): Promise<boolean> {
  const vote = await prisma.vote.findUnique({ where: { id: voteId } });
  if (!vote || vote.resolved) return vote?.resolved ?? false;

  const fieldsToCheck = getFieldsToCheck({
    org: vote.org,
    asn: vote.asn,
    usage: vote.usage,
    protocol: vote.protocol,
    keyConfig: vote.keyConfig,
  });

  for (const field of fieldsToCheck) {
    const isKnown = await isKnownOption(field.layer, field.value, field.parentKey);
    if (!isKnown) return false;
  }

  await prisma.vote.update({
    where: { id: voteId },
    data: { resolved: true },
  });

  return true;
}

// --- Cache management ---

/**
 * Clear the Redis cache for option lists.
 * Called when an option is promoted.
 */
export async function clearOptionCache(
  layer: string,
  parentKey: string
): Promise<void> {
  if (parentKey) {
    await redis.del(`options:${layer}:${parentKey}`);
  } else {
    await redis.del(`options:${layer}`);
  }
}
