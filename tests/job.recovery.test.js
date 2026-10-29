import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../src/config/prisma.js";
import { recoverStaleJobs } from "../src/modules/jobs/job.recovery.js";
import { randomUUID } from "node:crypto";

describe("Stale-job recovery", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("taskflow_test_db")) {
      throw new Error("Tests must use taskflow_test_db");
    }

    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.job.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createStaleJob({
    attempts = 1,
    maxAttempts = 3,
  } = {}) {
    const staleTime = new Date(Date.now() - 120_000);

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
        lockedAt: staleTime,
        startedAt: staleTime,
      },
    });
  }

  it("requeues a stale job when attempts remain", async () => {
    const job = await createStaleJob({
      attempts: 1,
      maxAttempts: 3,
    });

    const result = await recoverStaleJobs();

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(result).toEqual({ requeued: 1, failed: 0 });
    expect(updatedJob.status).toBe("PENDING");
    expect(updatedJob.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(updatedJob.lockedAt).toBeNull();
    expect(updatedJob.lastError).toContain("worker became unresponsive");
    expect(updatedJob.lockToken).toBeNull();
  });

  it("permanently fails a stale job when attempts are exhausted", async () => {
    const job = await createStaleJob({
      attempts: 3,
      maxAttempts: 3,
    });

    const result = await recoverStaleJobs();

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(result).toEqual({ requeued: 0, failed: 1 });
    expect(updatedJob.status).toBe("FAILED");
    expect(updatedJob.failedAt).toBeInstanceOf(Date);
    expect(updatedJob.lockedAt).toBeNull();
    expect(updatedJob.lastError).toContain("retry limit");
    expect(updatedJob.lockToken).toBeNull();
  });

  it("ignores jobs that are not stale", async () => {
    const job = await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        payload: {
          to: "test@example.com",
          subject: "Test email",
        },
        status: "PROCESSING",
        attempts: 1,
        maxAttempts: 3,
        lockedAt: new Date(),
        startedAt: new Date(),
      },
    });

    const result = await recoverStaleJobs();

    const unchangedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(result).toEqual({ requeued: 0, failed: 0 });
    expect(unchangedJob.status).toBe("PROCESSING");
  });
});