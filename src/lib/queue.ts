import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "./db";
import { matchOption, clusterOptions } from "./ai";
import {
  clearOptionCache,
  deduplicateCount,
  promoteOptionIfNeeded,
  tryResolveVote,
} from "./vote-service";

// --- Types ---

export interface MatchJobData {
  voteId: string;
  layer: string;
  value: string;
  parentKey: string;
  fingerprint: string;
}

// --- Queue instances (one per layer) ---

const LAYERS = ["org", "asn", "protocol", "keyConfig"] as const;

// Use a dedicated ioredis instance for BullMQ to avoid version mismatch
const globalForBullRedis = globalThis as unknown as { bullRedis: IORedis };
const bullRedis =
  globalForBullRedis.bullRedis ||
  new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
if (process.env.NODE_ENV !== "production") globalForBullRedis.bullRedis = bullRedis;

const connection = {
  connection: bullRedis as unknown as import("bullmq").ConnectionOptions,
};

const globalForQueues = globalThis as unknown as {
  matchQueues: Record<string, Queue<MatchJobData>>;
  matchWorkers: Record<string, Worker<MatchJobData>>;
};

function getQueues(): Record<string, Queue<MatchJobData>> {
  if (globalForQueues.matchQueues) return globalForQueues.matchQueues;

  const queues: Record<string, Queue<MatchJobData>> = {};
  for (const layer of LAYERS) {
    queues[layer] = new Queue<MatchJobData>(`match-${layer}`, connection);
  }

  globalForQueues.matchQueues = queues;
  return queues;
}

// --- Worker processing logic ---

async function processMatchJob(job: { data: MatchJobData }): Promise<void> {
  const { voteId, layer, value, parentKey, fingerprint } = job.data;

  // Get candidate options for this layer + parentKey
  const candidates = await prisma.dynamicOption.findMany({
    where: { layer, parentKey },
    select: { id: true, value: true },
  });

  // Let errors propagate — BullMQ will retry (3 attempts, exponential backoff).
  // If all retries fail, orphan recovery will re-queue in 2 hours.
  const matchResult = await matchOption(layer, candidates, value);

  // Determine the layer field mapping for Vote table
  const layerField = layer as "org" | "asn" | "protocol" | "keyConfig";

  if (matchResult.matched && matchResult.option_id) {
    // Match found → normalize vote value + deduplicate count
    const matchedOption = await prisma.dynamicOption.findUnique({
      where: { id: matchResult.option_id },
    });

    if (matchedOption) {
      // Update vote field to normalized value
      await prisma.vote.update({
        where: { id: voteId },
        data: { [layerField]: matchedOption.value },
      });

      // Deduplicate count
      await deduplicateCount(matchedOption.id, fingerprint);
    }
  } else {
    // No match → create new DynamicOption
    const newOption = await prisma.dynamicOption.upsert({
      where: { layer_value_parentKey: { layer, value, parentKey } },
      create: {
        layer,
        value,
        parentKey,
        submitCount: 0,
        isPreset: false,
        promoted: false,
      },
      update: {}, // already exists, handle via deduplicateCount
    });

    await deduplicateCount(newOption.id, fingerprint);
  }

  // Check if the relevant option should be promoted
  if (matchResult.matched && matchResult.option_id) {
    await promoteOptionIfNeeded(matchResult.option_id);
  } else {
    const opt = await prisma.dynamicOption.findUnique({
      where: { layer_value_parentKey: { layer, value, parentKey } },
    });
    if (opt) await promoteOptionIfNeeded(opt.id);
  }

  // Try to resolve the vote
  await tryResolveVote(voteId);
}

// --- Initialize workers ---

function initWorkers(): Record<string, Worker<MatchJobData>> {
  if (globalForQueues.matchWorkers) return globalForQueues.matchWorkers;

  const workers: Record<string, Worker<MatchJobData>> = {};

  for (const layer of LAYERS) {
    workers[layer] = new Worker<MatchJobData>(
      `match-${layer}`,
      async (job) => {
        // Handle scheduled jobs on the org queue
        if (job.name === "orphan-recovery") {
          await recoverOrphanVotes();
          return;
        }
        if (job.name === "option-clustering") {
          await clusterUnpromotedOptions();
          return;
        }
        await processMatchJob(job);
      },
      {
        ...connection,
        concurrency: 1,
        limiter: { max: 10, duration: 60_000 },
      }
    );

    workers[layer].on("failed", (job, err) => {
      console.error(`[Queue] match-${layer} job ${job?.id} failed:`, err.message);
    });
  }

  globalForQueues.matchWorkers = workers;
  return workers;
}

// --- Orphan recovery (repeatable job) ---

async function recoverOrphanVotes(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const orphanVotes = await prisma.vote.findMany({
    where: {
      resolved: false,
      queueFailed: false,
      createdAt: { lt: tenMinutesAgo },
    },
  });

  for (const vote of orphanVotes) {
    // Re-classify fields
    const fieldsToCheck = getVoteFieldsToCheck(vote);

    for (const field of fieldsToCheck) {
      const option = await prisma.dynamicOption.findUnique({
        where: {
          layer_value_parentKey: {
            layer: field.layer,
            value: field.value,
            parentKey: field.parentKey,
          },
        },
      });

      // Only re-queue if no DynamicOption exists at all,
      // meaning the original queue job was lost (Redis restart, worker crash, etc.)
      // If option exists (even unpromoted), AI already processed it — don't re-queue.
      if (!option) {
        await addToMatchQueue({
          voteId: vote.id,
          layer: field.layer,
          value: field.value,
          parentKey: field.parentKey,
          fingerprint: vote.fingerprint,
        });
      }
    }
  }
}

function getVoteFieldsToCheck(vote: {
  org: string;
  asn: string;
  usage: string;
  protocol: string | null;
  keyConfig: string | null;
}) {
  const fields = [
    { layer: "org", value: vote.org, parentKey: "" },
    { layer: "asn", value: vote.asn, parentKey: vote.org },
  ];

  if (vote.usage === "proxy") {
    if (vote.protocol) {
      fields.push({ layer: "protocol", value: vote.protocol, parentKey: "" });
    }
    if (vote.keyConfig) {
      fields.push({ layer: "keyConfig", value: vote.keyConfig, parentKey: "" });
    }
  }

  return fields;
}

// --- Option clustering (repeatable job) ---

async function clusterUnpromotedOptions(): Promise<void> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  // Get all unpromoted, non-preset options grouped by layer + parentKey
  const options = await prisma.dynamicOption.findMany({
    where: {
      promoted: false,
      isPreset: false,
      createdAt: { lt: thirtyMinutesAgo },
    },
    select: { id: true, layer: true, parentKey: true, value: true, submitCount: true },
  });

  type OptionItem = typeof options[number];

  // Group by layer + parentKey
  const groups: Record<string, OptionItem[]> = {};
  for (const opt of options) {
    const key = `${opt.layer}::${opt.parentKey}`;
    if (groups[key]) {
      groups[key].push(opt);
    } else {
      groups[key] = [opt];
    }
  }

  for (const group of Object.values(groups)) {
    if (group.length < 2) continue;

    const { layer, parentKey } = group[0];

    let result;
    try {
      result = await clusterOptions(layer, group);
    } catch (err) {
      console.error(`[Cluster] AI clustering failed for ${layer}/${parentKey}:`, err);
      continue; // Skip this group, retry next cycle
    }

    for (const cluster of result.clusters) {
      if (cluster.member_ids.length < 2) continue;

      // Validate all IDs exist in this group
      const groupIds = new Set(group.map((o: OptionItem) => o.id));
      const validMembers = cluster.member_ids.filter((id: string) => groupIds.has(id));
      if (validMembers.length < 2) continue;
      if (!groupIds.has(cluster.canonical_id)) continue;

      const canonical = group.find((o: OptionItem) => o.id === cluster.canonical_id)!;
      const others = validMembers.filter((id: string) => id !== cluster.canonical_id);

      const layerField = layer as "org" | "asn" | "protocol" | "keyConfig";

      for (const memberId of others) {
        const member = group.find((o: OptionItem) => o.id === memberId)!;

        // Migrate OptionContributors to canonical (skip duplicates via P2002)
        const contributors = await prisma.optionContributor.findMany({
          where: { optionId: memberId },
        });

        for (const contrib of contributors) {
          try {
            await prisma.optionContributor.create({
              data: { optionId: canonical.id, fingerprint: contrib.fingerprint },
            });
          } catch (error: unknown) {
            // P2002 = already contributed to canonical, skip
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              (error as { code: string }).code === "P2002"
            ) {
              continue;
            }
            throw error;
          }
        }

        // Update votes referencing member.value → canonical.value
        await prisma.vote.updateMany({
          where: { [layerField]: member.value },
          data: { [layerField]: canonical.value },
        });

        // Delete member's contributors and the member option itself
        await prisma.optionContributor.deleteMany({ where: { optionId: memberId } });
        await prisma.dynamicOption.delete({ where: { id: memberId } });
      }

      // Recalculate canonical's submitCount from actual contributors
      const actualCount = await prisma.optionContributor.count({
        where: { optionId: canonical.id },
      });
      await prisma.dynamicOption.update({
        where: { id: canonical.id },
        data: { submitCount: actualCount },
      });

      // Check if canonical can now be promoted
      await promoteOptionIfNeeded(canonical.id);

      // Clear cache for this layer/parentKey
      await clearOptionCache(layer, parentKey);
    }
  }
}

// --- Public API ---

/**
 * Add a match job to the appropriate layer queue.
 * Returns true if job was added successfully.
 */
export async function addToMatchQueue(data: MatchJobData): Promise<boolean> {
  const queues = getQueues();
  const queue = queues[data.layer];
  if (!queue) return false;

  await queue.add("match", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  });

  return true;
}

/**
 * Initialize the queue system: create workers and register orphan recovery.
 * Should be called once at app startup.
 */
export function initQueueSystem(): void {
  const queues = getQueues();
  initWorkers();

  // Register orphan recovery repeatable job on the org queue
  queues.org
    .add(
      "orphan-recovery",
      { voteId: "", layer: "org", value: "", parentKey: "", fingerprint: "" },
      {
        repeat: { pattern: "0 */2 * * *" }, // every 2 hours
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    )
    .catch((err) => {
      console.error("[Queue] Failed to register orphan recovery:", err);
    });

  // Register option clustering repeatable job on the org queue
  queues.org
    .add(
      "option-clustering",
      { voteId: "", layer: "org", value: "", parentKey: "", fingerprint: "" },
      {
        repeat: { pattern: "0 */2 * * *" }, // every 2 hours
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    )
    .catch((err) => {
      console.error("[Queue] Failed to register option clustering:", err);
    });
}

// Auto-initialize when this module is imported
initQueueSystem();
