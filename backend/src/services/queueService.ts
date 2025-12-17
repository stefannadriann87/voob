/**
 * Queue Service pentru Background Jobs
 * Folosește BullMQ pentru job queue management
 */

const { Queue, Worker } = require("bullmq");
const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");
import type { Job } from "bullmq";

// Queue names
const QUEUE_NAMES = {
  SMS_REMINDER: "sms-reminder",
  SMS_NOTIFICATION: "sms-notification",
  EMAIL_NOTIFICATION: "email-notification",
};

// Queue instances (lazy initialization)
const queues: Record<string, any> = {};

/**
 * Obține sau creează o queue
 */
async function getQueue(queueName: string): Promise<any> {
  if (queues[queueName]) {
    return queues[queueName];
  }

  // BullMQ folosește Redis connection
  // Verifică dacă Redis este disponibil
  const redis = await getRedisClient();
  if (!redis) {
    throw new Error("Redis client not available for queue");
  }

  // BullMQ connection config (folosește aceleași setări ca Redis client)
  const connection = {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
  };

  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000, // 2s, 4s, 8s
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24h
        count: 1000, // Keep last 1000 jobs
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  });

  queues[queueName] = queue;
  logger.info(`✅ Queue created: ${queueName}`);
  
  return queue;
}

/**
 * Adaugă un job în queue
 */
async function addJob(
  queueName: string,
  jobData: any,
  options?: {
    delay?: number; // Delay în ms
    priority?: number; // Prioritate (mai mare = mai important)
    jobId?: string; // ID unic pentru idempotency
  }
): Promise<any> {
  const queue = await getQueue(queueName);
  
  return await queue.add(
    queueName,
    jobData,
    {
      delay: options?.delay || 0,
      priority: options?.priority || 0,
      jobId: options?.jobId, // Pentru idempotency
    }
  );
}

/**
 * Creează un worker pentru procesarea job-urilor
 */
function createWorker(
  queueName: string,
  processor: (job: any) => Promise<any>
): any {
  const connection = {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      logger.info(`Processing job ${job.id} from queue ${queueName}`);
      try {
        const result = await processor(job);
        logger.info(`Job ${job.id} completed successfully`);
        return result;
      } catch (error: any) {
        logger.error(`Job ${job.id} failed:`, error);
        throw error; // Re-throw pentru retry logic
      }
    },
    {
      connection,
      concurrency: Number(process.env.QUEUE_CONCURRENCY || 5), // Procesează 5 job-uri simultan
      limiter: {
        max: 10, // Max 10 job-uri
        duration: 1000, // Per secundă
      },
    }
  );

  worker.on("completed", (job: any) => {
    logger.info(`Job ${job.id} completed`);
  });

  worker.on("failed", (job: any, err: any) => {
    logger.error(`Job ${job?.id} failed:`, err);
  });

  logger.info(`✅ Worker created for queue: ${queueName}`);
  return worker;
}

/**
 * Obține statistici despre queue
 */
async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = await getQueue(queueName);
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}

/**
 * Șterge toate job-urile dintr-o queue (pentru cleanup)
 */
async function cleanQueue(queueName: string, grace: number = 1000): Promise<void> {
  const queue = await getQueue(queueName);
  await queue.clean(grace, 100, "completed");
  await queue.clean(grace, 100, "failed");
  logger.info(`Cleaned queue: ${queueName}`);
}

module.exports = {
  getQueue,
  addJob,
  createWorker,
  getQueueStats,
  cleanQueue,
  QUEUE_NAMES,
};
