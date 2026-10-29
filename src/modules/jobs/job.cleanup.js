import { prisma } from "../../config/prisma.js";

export const JOB_RETENTION_MS = {
  COMPLETED: 7 * 24 * 60 * 60 * 1000,
  FAILED: 30 * 24 * 60 * 60 * 1000,
  CANCELLED: 7 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

export async function cleanupOldJobs({
  now = new Date(),
  batchSize = DEFAULT_CLEANUP_BATCH_SIZE,
} = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive integer");
  }

  const completedCutoff = new Date(
    now.getTime() - JOB_RETENTION_MS.COMPLETED,
  );
  const failedCutoff = new Date(
    now.getTime() - JOB_RETENTION_MS.FAILED,
  );
  const cancelledCutoff = new Date(
    now.getTime() - JOB_RETENTION_MS.CANCELLED,
  );

  const eligibleJobs = {
    OR: [
      {
        status: "COMPLETED",
        completedAt: { lt: completedCutoff },
      },
      {
        status: "FAILED",
        failedAt: { lt: failedCutoff },
      },
      {
        status: "CANCELLED",
        updatedAt: { lt: cancelledCutoff },
      },
    ],
  };

  const candidates = await prisma.job.findMany({
    where: eligibleJobs,
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  if (candidates.length === 0) {
    return 0;
  }

  // Recheck eligibility during deletion so a job that is no longer
  // eligible cannot be deleted based only on an earlier query.
  const result = await prisma.job.deleteMany({
    where: {
      id: { in: candidates.map((job) => job.id) },
      ...eligibleJobs,
    },
  });

  return result.count;
}