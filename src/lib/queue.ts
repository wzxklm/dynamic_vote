import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "./db";
import { matchOption, matchOptionFallback } from "./ai";
import {
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

// --- AI degradation tracking ---

let aiFailSince: number | null = null;
const AI_DEGRADE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function isAIDegraded(): boolean {
  if (!aiFailSince) return false;
  return Date.now() - aiFailSince >= AI_DEGRADE_THRESHOLD_MS;
}

function markAIFail() {
  if (!aiFailSince) aiFailSince = Date.now();
}

function markAISuccess() {
  aiFailSince = null;
}

// --- Worker processing logic ---

async function processMatchJob(job: { data: MatchJobData }): Promise<void> {
  const { voteId, layer, value, parentKey, fingerprint } = job.data;

  // Get candidate options for this layer + parentKey
  const candidates = await prisma.dynamicOption.findMany({
    where: { layer, parentKey },
    select: { id: true, value: true },
  });

  let matchResult;

  if (isAIDegraded()) {
    // Fallback mode: exact string match
    matchResult = matchOptionFallback(candidates, value);
  } else {
    try {
      matchResult = await matchOption(layer, candidates, value);
      markAISuccess();
    } catch {
      markAIFail();
      // Use fallback for this job
      matchResult = matchOptionFallback(candidates, value);
    }
  }

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
      async (job) => processMatchJob(job),
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

      const isKnown = option && (option.isPreset || option.promoted);
      if (!isKnown) {
        // Re-queue this field
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
        repeat: { pattern: "*/5 * * * *" }, // every 5 minutes
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    )
    .catch((err) => {
      console.error("[Queue] Failed to register orphan recovery:", err);
    });

  // Add special handling for orphan recovery jobs in the org worker
  const orgWorker = globalForQueues.matchWorkers?.org;
  if (orgWorker) {
    // Replace the org worker to handle both match and orphan-recovery jobs
    orgWorker.close();

    globalForQueues.matchWorkers.org = new Worker<MatchJobData>(
      "match-org",
      async (job) => {
        if (job.name === "orphan-recovery") {
          await recoverOrphanVotes();
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
  }
}

// Auto-initialize when this module is imported
initQueueSystem();
