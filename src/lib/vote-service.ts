import { prisma } from "./db";
import type { VoteFormData } from "./validators";

interface VoteResult {
  id: string;
  resolved: boolean;
}

/**
 * Process a vote submission:
 * 1. Create Vote record
 * 2. Classify each field (known vs custom)
 * 3. Set resolved status
 * 4. Queue AI matching for custom fields (Phase 3)
 */
export async function submitVote(data: VoteFormData): Promise<VoteResult> {
  // Create vote record
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
      resolved: false, // will be updated after classification
    },
  });

  // Classify fields
  const fieldsToCheck = getFieldsToCheck(data);
  const customFields: { layer: string; value: string; parentKey: string }[] = [];

  for (const field of fieldsToCheck) {
    const isKnown = await isKnownOption(field.layer, field.value, field.parentKey);
    if (!isKnown) {
      customFields.push(field);
    }
  }

  if (customFields.length === 0) {
    // All fields are known preset/promoted options
    await prisma.vote.update({
      where: { id: vote.id },
      data: { resolved: true },
    });
    return { id: vote.id, resolved: true };
  }

  // Contains custom fields - resolved stays false
  // In Phase 3, we'll queue AI matching tasks for each custom field here
  return { id: vote.id, resolved: false };
}

/**
 * Get the list of fields to check for a vote.
 * parentKey follows the schema convention:
 * - org: "" (global)
 * - asn: org value
 * - protocol: "" (global)
 * - keyConfig: "" (global)
 */
function getFieldsToCheck(data: VoteFormData) {
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
 * Query includes parentKey for exact matching.
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

/**
 * Try to resolve a vote by checking if all its fields reference known options.
 * Called after AI matching or option promotion.
 */
export async function tryResolveVote(voteId: string): Promise<boolean> {
  const vote = await prisma.vote.findUnique({ where: { id: voteId } });
  if (!vote || vote.resolved) return vote?.resolved ?? false;

  const fieldsToCheck = getFieldsToCheck({
    isBlocked: vote.isBlocked,
    org: vote.org,
    asn: vote.asn,
    usage: vote.usage as "proxy" | "website",
    protocol: vote.protocol,
    keyConfig: vote.keyConfig,
    count: vote.count,
    fingerprint: vote.fingerprint,
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
