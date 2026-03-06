import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient();
export const prisma = globalForPrisma.prisma;

const globalForRedis = globalThis as unknown as { redis: Redis };

if (!globalForRedis.redis)
  globalForRedis.redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
export const redis = globalForRedis.redis;
