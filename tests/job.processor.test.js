import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("../src/modules/jobs/job.handlers", () => ({
  executeJob: vi.fn(),
}));

import { prisma } from "../src/config/prisma.js";
import { executeJob } from "../src/modules/jobs/job.handlers.js";
import {
  claimNextJob,
  processJob
} from "../src/modules/jobs/job.processor.js";

describe("Job processor", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("taskflow_test_db")) {
      throw new Error("Tests must use taskflow_test_db");
    }

    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.job.deleteMany();
    vi.resetAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createProcessingJob({
    attempts = 1,
    maxAttempts = 3,
  } = {}) {
    return prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        payload: {
          to: "test@example.com",
          subject: "Test email",
        },
        status: "PROCESSING",
        attempts,
        maxAttempts,
        lockedAt: new Date(),
        lockToken: randomUUID(),
        startedAt: new Date(),
      },
    });
  }

  it("marks a successful job as COMPLETED", async () => {
    executeJob.mockResolvedValueOnce(undefined);

    const job = await createProcessingJob();

    await processJob(job);

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(executeJob).toHaveBeenCalledWith(
      job,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    
    expect(updatedJob.status).toBe("COMPLETED");
    expect(updatedJob.completedAt).toBeInstanceOf(Date);
    expect(updatedJob.lockedAt).toBeNull();
    expect(updatedJob.lastError).toBeNull();

    expect(updatedJob.durationMs).toEqual(expect.any(Number));
    expect(updatedJob.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("requeues a failed job when attempts remain", async () => {
    executeJob.mockRejectedValueOnce(
      new Error("Temporary email service failure"),
    );

    const job = await createProcessingJob({
      attempts: 1,
      maxAttempts: 3,
    });

    await processJob(job);

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(updatedJob.status).toBe("PENDING");
    expect(updatedJob.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(updatedJob.lockedAt).toBeNull();
    expect(updatedJob.lastError).toBe(
      "Temporary email service failure",
    );
    expect(updatedJob.failedAt).toBeNull();

    expect(updatedJob.durationMs).toEqual(expect.any(Number));
    expect(updatedJob.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("marks a job as FAILED when all attempts are exhausted", async () => {
    executeJob.mockRejectedValueOnce(
      new Error("Permanent email service failure"),
    );

    const job = await createProcessingJob({
      attempts: 3,
      maxAttempts: 3,
    });

    await processJob(job);

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(updatedJob.status).toBe("FAILED");
    expect(updatedJob.failedAt).toBeInstanceOf(Date);
    expect(updatedJob.lockedAt).toBeNull();
    expect(updatedJob.lastError).toBe(
      "Permanent email service failure",
    );

    expect(updatedJob.durationMs).toEqual(expect.any(Number));
    expect(updatedJob.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("allows concurrent workers to claim different jobs", async () => {
    const jobs = await prisma.job.createMany({
      data: [
        {
          type: "SEND_EMAIL",
          payload: { to: "one@example.com", subject: "First" },
          runAt: new Date(Date.now() - 1000),
        },
        {
          type: "SEND_EMAIL",
          payload: { to: "two@example.com", subject: "Second" },
          runAt: new Date(Date.now() - 1000),
        },
      ],
    });

    expect(jobs.count).toBe(2);

    const [firstClaim, secondClaim] = await Promise.all([
        claimNextJob(),
        claimNextJob(),
    ]);

    expect(firstClaim).not.toBeNull();
    expect(secondClaim).not.toBeNull();

    expect(firstClaim.id).not.toBe(secondClaim.id);

    expect(firstClaim.status).toBe("PROCESSING");
    expect(secondClaim.status).toBe("PROCESSING");

    expect(firstClaim.attempts).toBe(1);
    expect(secondClaim.attempts).toBe(1);

    expect(firstClaim.lockToken).toBeTruthy();
    expect(secondClaim.lockToken).toBeTruthy();
    expect(firstClaim.lockToken).not.toBe(secondClaim.lockToken);

    const processingJobs = await prisma.job.findMany({
      where: {
        id: {
          in: [
            firstClaim.id,
            secondClaim.id,
          ],
        },
      },
      select: {
        id: true,
        attempts: true,
        lockToken: true,
        status: true,
      },
    });

    expect(processingJobs).toHaveLength(2);
    expect(processingJobs.every((job) => job.attempts === 1)).toBe(true);
    expect(processingJobs.every((job) => job.status === "PROCESSING")).toBe(true);
    expect(new Set(processingJobs.map((job) => job.lockToken)).size).toBe(2);
  });

  it("prevents an outdated worker from completing a reclaimed job", async () => {
    executeJob.mockResolvedValueOnce(undefined);
  
    // Worker A claims the job.
    const oldClaim = await createProcessingJob();
  
    // Simulate recovery and Worker B claiming the same job.
    const newLockToken = randomUUID();
  
    await prisma.job.update({
      where: { id: oldClaim.id },
      data: {
        status: "PROCESSING",
        lockToken: newLockToken,
        lockedAt: new Date(),
      },
    });
  
    // Worker A resumes and tries to complete its old claim.
    await processJob(oldClaim);
  
    const currentJob = await prisma.job.findUnique({
      where: { id: oldClaim.id },
    });
  
    // Worker A must not overwrite Worker B's claim.
    expect(currentJob.status).toBe("PROCESSING");
    expect(currentJob.lockToken).toBe(newLockToken);
    expect(currentJob.completedAt).toBeNull();
  });

  it("propagates a completion persistence error without retrying the job", async () => {
    const job = await createProcessingJob({
      attempts: 1,
      maxAttempts: 3,
    });

    executeJob.mockResolvedValueOnce(undefined);

    const persistenceError = new Error("Database unavailable");

    const updateSpy = vi
      .spyOn(prisma.job, "updateMany")
      .mockRejectedValueOnce(persistenceError);

    await expect(processJob(job)).rejects.toThrow("Database unavailable");

    expect(executeJob).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const unchangedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(unchangedJob.status).toBe("PROCESSING");
    expect(unchangedJob.lockToken).toBe(job.lockToken);
  });
});