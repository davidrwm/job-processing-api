import { prisma } from "../../config/prisma.js";

const STALE_JOB_TIMEOUT_MS = 60_000;

export async function recoverStaleJobs() {
  const staleBefore = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);

  const staleJobs = await prisma.job.findMany({
    where: {
      status: "PROCESSING",
      lockedAt: {
        lt: staleBefore,
      },
    },
    select: {
      id: true,
      attempts: true,
      maxAttempts: true,
      lockToken: true,
    },
  });

  let requeued = 0;
  let failed = 0;

  for (const job of staleJobs) {
    const now = new Date();

    if (job.attempts < job.maxAttempts) {
      const delayMs = Math.min(
        1000 * 2 ** Math.max(job.attempts - 1, 0),
        60_000,
      );

      const result = await prisma.job.updateMany({
        where: {
          id: job.id,
          status: "PROCESSING",
          lockedAt: { lt: staleBefore },
          lockToken: job.lockToken,
        },
        data: {
          status: "PENDING",
          runAt: new Date(now.getTime() + delayMs),
          lockedAt: null,
          lockToken: null,
          lastError: "Job recovered after worker became unresponsive",
        },
      });

      requeued += result.count;
    } else {
      const result = await prisma.job.updateMany({
        where: {
          id: job.id,
          status: "PROCESSING",
          lockedAt: { lt: staleBefore },
          lockToken: job.lockToken,
        },
        data: {
          status: "FAILED",
          failedAt: now,
          lockedAt: null,
          lockToken: null,
          lastError: "Job exceeded its processing timeout and retry limit",
        },
      });

      failed += result.count;
    }
  }

  if (requeued > 0 || failed > 0) {
    console.log(
      `Stale-job recovery: requeued ${requeued}, permanently failed ${failed}`,
    );
  }

  return { requeued, failed };
}