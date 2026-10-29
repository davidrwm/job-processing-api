import "dotenv/config";

import { prisma } from "./config/prisma.js";
import { processNextJob } from "./modules/jobs/job.processor.js";
import { recoverStaleJobs } from "./modules/jobs/job.recovery.js";
import { cleanupOldJobs } from "./modules/jobs/job.cleanup.js";

const POLL_INTERVAL_MS = 1000;
const RECOVERY_INTERVAL_MS = 10_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let running = true;
let lastRecoveryAt = 0;
let lastCleanupAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker() {
  console.log("TaskFlow worker started");

  try {
    while (running) {
      try {
        if (Date.now() - lastRecoveryAt >= RECOVERY_INTERVAL_MS) {
          await recoverStaleJobs();
          lastRecoveryAt = Date.now();
        }

        if (Date.now() - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
          try {
            const deletedCount = await cleanupOldJobs();

            if (deletedCount > 0) {
              console.log(`Cleaned up ${deletedCount} old jobs`);
            }

            lastCleanupAt = Date.now();
          } catch (error) {
            console.error("Job cleanup failed:", error);
            // Don't update lastCleanupAt on failure; retry on the next loop.
          }
        }

        // Shutdown requests prevent the next job from being claimed.
        if (!running) break;

        const processed = await processNextJob();

        if (!processed && running) {
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error("Worker encountered an error:", error);

        if (running) {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
    console.log("TaskFlow worker stopped");
  }
}

function shutdown(signal) {
  if (!running) {
    return;
  }

  console.log(`\n${signal} received. Shutting down after current work...`);
  running = false;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startWorker().catch((error) => {
  console.error("Worker failed:", error);
  process.exitCode = 1;
});