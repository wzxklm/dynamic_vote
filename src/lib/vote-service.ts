import { prisma, redis } from "./db";
import { isPrismaUniqueViolation } from "./utils";
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
 * Batch-check which fields are known options (isPreset=true or promoted=true).
 * Returns a Set of indices (into the input array) that are known.
 * Eliminates N+1 queries by fetching all fields in a single OR query.
 */
async function checkKnownOptions(
  fields: { layer: string; value: string; parentKey: string }[]
): Promise<Set<number>> {
  if (fields.length === 0) return new Set();

  const foundOptions = await prisma.dynamicOption.findMany({
    where: { OR: fields },
    select: { layer: true, value: true, parentKey: true, isPreset: true, promoted: true },
  });

  const knownSet = new Set<string>();
  for (const opt of foundOptions) {
    if (opt.isPreset || opt.promoted) {
      knownSet.add(`${opt.layer}::${opt.value}::${opt.parentKey}`);
    }
  }

  const result = new Set<number>();
  for (let i = 0; i < fields.length; i++) {
    const key = `${fields[i].layer}::${fields[i].value}::${fields[i].parentKey}`;
    if (knownSet.has(key)) {
      result.add(i);
    }
  }

  return result;
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
  const knownIndices = await checkKnownOptions(fieldsToCheck);
  const customFields: { layer: string; value: string; parentKey: string }[] = [];

  for (let i = 0; i < fieldsToCheck.length; i++) {
    if (!knownIndices.has(i)) {
      customFields.push(fieldsToCheck[i]);
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
    if (isPrismaUniqueViolation(error)) return;
    throw error;
  }
}

// --- Option promotion ---

/**
 * Check if an option should be promoted (submitCount >= 3).
 * If promoted, clear cache and try to resolve related votes.
 */
export async function promoteOptionIfNeeded(optionId: string): Promise<void> {
  // Atomic promote: avoids TOCTOU race by combining read + condition + update
  const { count } = await prisma.dynamicOption.updateMany({
    where: { id: optionId, promoted: false, submitCount: { gte: 3 } },
    data: { promoted: true },
  });
  if (count === 0) return; // already promoted or not ready

  const option = await prisma.dynamicOption.findUnique({
    where: { id: optionId },
  });
  if (!option) return;

  // Clear option cache for this layer
  await clearOptionCache(option.layer, option.parentKey);

  // Find all unresolved votes referencing this option value
  const layerField = option.layer as "org" | "asn" | "protocol" | "keyConfig";
  const whereClause: Record<string, unknown> = {
    [layerField]: option.value,
    resolved: false,
  };

  // Bug 8: For ASN layer, also filter by org to avoid cross-org matches
  if (option.layer === "asn" && option.parentKey) {
    whereClause.org = option.parentKey;
  }

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

  const knownIndices = await checkKnownOptions(fieldsToCheck);
  if (knownIndices.size !== fieldsToCheck.length) return false;

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
