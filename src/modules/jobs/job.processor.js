import { randomUUID } from "node:crypto";

import { prisma } from "../../config/prisma.js";
import { executeJobWithTimeout } from "./job.executor.js";

export async function claimNextJob() {
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw`
      SELECT "id"
      FROM "jobs"
      WHERE "status" = 'PENDING'::"JobStatus"
        AND "runAt" <= NOW()
        AND "attempts" < "maxAttempts"
      ORDER BY "runAt" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (jobs.length === 0) {
      return null;
    }

    const lockToken = randomUUID();
    const now = new Date();

    return tx.job.update({
      where: { id: jobs[0].id },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        startedAt: now,
        lockedAt: now,
        lockToken,
      },
    });
  });
}

export async function processJob(job) {
  const processingStartedAt = Date.now();

  let executionError = null;

  try {
    await executeJobWithTimeout(job);
  } catch (error) {
    executionError = error;
  }

  const durationMs = Date.now() - processingStartedAt;

  // Persist success separately from execution.
  // Database errors here must not be mistaken for handler failures.
  if (!executionError) {
    const result = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: "PROCESSING",
        lockToken: job.lockToken,
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        durationMs,
        lockedAt: null,
        lockToken: null,
        lastError: null,
      },
    });

    if (result.count === 0) {
      console.warn(
        `Job ${job.id}: claim ownership lost; ignoring completion`,
      );
      return;
    }

    console.log(`Job ${job.id} completed`);
    return;
  }

  const message =
    executionError instanceof Error
      ? executionError.message
      : String(executionError);

  const canRetry = job.attempts < job.maxAttempts;

  if (canRetry) {
    const delayMs = Math.min(
      1000 * 2 ** (job.attempts - 1),
      60_000,
    );

    const result = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: "PROCESSING",
        lockToken: job.lockToken,
      },
      data: {
        status: "PENDING",
        runAt: new Date(Date.now() + delayMs),
        durationMs,
        lockedAt: null,
        lockToken: null,
        lastError: message,
      },
    });

    if (result.count === 0) {
      console.warn(
        `Job ${job.id}: claim ownership lost; ignoring retry`,
      );
      return;
    }

    console.error(
      `Job ${job.id} failed; retry scheduled in ${delayMs}ms`,
      message,
    );
    return;
  }

  const result = await prisma.job.updateMany({
    where: {
      id: job.id,
      status: "PROCESSING",
      lockToken: job.lockToken,
    },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      durationMs,
      lockedAt: null,
      lockToken: null,
      lastError: message,
    },
  });

  if (result.count === 0) {
    console.warn(
      `Job ${job.id}: claim ownership lost; ignoring failure`,
    );
    return;
  }

  console.error(`Job ${job.id} permanently failed`, message);
}

export async function processNextJob() {
  const job = await claimNextJob();

  if (!job) return false;

  console.log(
    `Processing job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`,
  );

  await processJob(job);
  return true;
}