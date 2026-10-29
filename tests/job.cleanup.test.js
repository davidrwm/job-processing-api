import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "../src/config/prisma.js";
import { cleanupOldJobs } from "../src/modules/jobs/job.cleanup.js";

const createdJobIds = [];

async function createJob(data) {
  const job = await prisma.job.create({
    data: {
      type: "SEND_EMAIL",
      payload: { to: "cleanup-test@example.com", subject: "Cleanup test" },
      ...data,
    },
  });

  createdJobIds.push(job.id);
  return job;
}

afterEach(async () => {
  if (createdJobIds.length > 0) {
    await prisma.job.deleteMany({
      where: { id: { in: createdJobIds } },
    });
    createdJobIds.length = 0;
  }
});

describe("cleanupOldJobs", () => {
  it("deletes old completed jobs but preserves recent ones", async () => {
    const now = new Date("2026-10-28T00:00:00.000Z");

    const oldCompletedAt = new Date(
      now.getTime() - 8 * 24 * 60 * 60 * 1000,
    );

    const recentCompletedAt = new Date(
      now.getTime() - 2 * 24 * 60 * 60 * 1000,
    );

    const oldJob = await createJob({
      status: "COMPLETED",
      completedAt: oldCompletedAt,
    });

    const recentJob = await createJob({
      status: "COMPLETED",
      completedAt: recentCompletedAt,
    });

    const deletedCount = await cleanupOldJobs({ now });

    expect(deletedCount).toBe(1);

    const remaining = await prisma.job.findMany({
      where: { id: { in: [oldJob.id, recentJob.id] } },
      select: { id: true },
    });

    expect(remaining.map((job) => job.id)).toEqual([recentJob.id]);

    // The old job was deleted, so don't attempt to clean it up again.
    createdJobIds.splice(createdJobIds.indexOf(oldJob.id), 1);
  });

  it("does not delete pending or processing jobs", async () => {
    const now = new Date("2026-10-28T00:00:00.000Z");
    const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const pendingJob = await createJob({
      status: "PENDING",
      createdAt: oldDate,
      runAt: oldDate,
    });

    const processingJob = await createJob({
      status: "PROCESSING",
      createdAt: oldDate,
      startedAt: oldDate,
      lockedAt: oldDate,
      lockToken: "b4e9f1d8-6a7c-4b2d-9e3f-1a5c7d8b9e20",
    });

    const deletedCount = await cleanupOldJobs({ now });

    expect(deletedCount).toBe(0);

    const remainingCount = await prisma.job.count({
      where: {
        id: { in: [pendingJob.id, processingJob.id] },
      },
    });

    expect(remainingCount).toBe(2);
  });

  it("rejects an invalid batch size", async () => {
    await expect(
      cleanupOldJobs({ batchSize: 0 }),
    ).rejects.toThrow("batchSize must be a positive integer");
  });
});