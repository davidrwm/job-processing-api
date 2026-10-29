import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import request from "supertest";

import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("taskflow_test_db")) {
    throw new Error(
      "Tests must use the taskflow_test_db database. Check .env.test."
    );
  }

  await prisma.$connect();
});

afterEach(async () => {
  await prisma.job.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/v1/jobs", () => {
  it("creates a job and returns 201", async () => {
    const response = await request(app)
      .post("/api/v1/jobs")
      .send({
        type: "SEND_EMAIL",
        payload: {
          to: "user@example.com",
          subject: "Welcome",
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");

    const job = response.body.data.job;

    expect(job.id).toBeDefined();
    expect(job.type).toBe("SEND_EMAIL");
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(0);
    expect(job.maxAttempts).toBe(3);

    const savedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(savedJob).not.toBeNull();
    expect(savedJob.payload).toEqual({
      to: "user@example.com",
      subject: "Welcome",
    });
  });

  it("rejects an unsupported job type", async () => {
    const response = await request(app)
      .post("/api/v1/jobs")
      .send({
        type: "UNKNOWN_JOB",
        payload: {},
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Validation failed");

    expect(await prisma.job.count()).toBe(0);
  });

  it("rejects a missing payload", async () => {
    const response = await request(app)
      .post("/api/v1/jobs")
      .send({
        type: "SEND_EMAIL",
      });

    expect(response.status).toBe(400);
    expect(await prisma.job.count()).toBe(0);
  });

  it("rejects a non-object payload", async () => {
    const response = await request(app)
      .post("/api/v1/jobs")
      .send({
        type: "SEND_EMAIL",
        payload: ["not", "an", "object"],
      });

    expect(response.status).toBe(400);
    expect(await prisma.job.count()).toBe(0);
  });

  it("accepts a custom retry limit and scheduled time", async () => {
    const runAt = "2027-01-01T10:00:00.000Z";

    const response = await request(app)
      .post("/api/v1/jobs")
      .send({
        type: "GENERATE_REPORT",
        payload: { reportId: "report-123" },
        maxAttempts: 5,
        runAt,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.job.maxAttempts).toBe(5);
    expect(new Date(response.body.data.job.runAt).toISOString())
      .toBe(runAt);
  });

  it("rejects a retry limit outside the allowed range", async () => {
    const response = await request(app)
      .post("/api/v1/jobs")
      .send({
        type: "SEND_EMAIL",
        payload: {},
        maxAttempts: 20,
      });

    expect(response.status).toBe(400);
    expect(await prisma.job.count()).toBe(0);
  });
});

describe("GET /api/v1/jobs", () => {
  it("returns an empty list when there are no jobs", async () => {
    const response = await request(app)
      .get("/api/v1/jobs");

    expect(response.status).toBe(200);
    expect(response.body.data.jobs).toEqual([]);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it("returns jobs with pagination", async () => {
    await prisma.job.createMany({
      data: [
        {
          type: "SEND_EMAIL",
          payload: { to: "one@example.com" },
        },
        {
          type: "GENERATE_REPORT",
          payload: { reportId: "report-2" },
        },
        {
          type: "PROCESS_FILE",
          payload: { fileId: "file-3" },
        },
      ],
    });

    const response = await request(app)
      .get("/api/v1/jobs?page=1&limit=2");

    expect(response.status).toBe(200);
    expect(response.body.data.jobs).toHaveLength(2);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    expect(response.body.data.jobs[0].payload).toBeUndefined();
  });

  it("rejects invalid pagination parameters", async () => {
    const response = await request(app)
      .get("/api/v1/jobs?page=0&limit=200");

    expect(response.status).toBe(400);
  });
});

describe("GET /api/v1/jobs/:jobId", () => {
  it("returns a job by ID", async () => {
    const createdJob = await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        payload: { to: "user@example.com" },
      },
    });

    const response = await request(app)
      .get(`/api/v1/jobs/${createdJob.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.job.id).toBe(createdJob.id);
    expect(response.body.data.job.payload).toEqual({
      to: "user@example.com",
    });
  });

  it("returns 404 when the job does not exist", async () => {
    const missingId = "00000000-0000-4000-8000-000000000000";

    const response = await request(app)
      .get(`/api/v1/jobs/${missingId}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Job not found");
  });

  it("returns 400 for an invalid UUID", async () => {
    const response = await request(app)
      .get("/api/v1/jobs/not-a-uuid");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid job ID");
  });
});


describe("GET /api/v1/jobs filters", () => {
  it("filters jobs by status", async () => {
    await prisma.job.createMany({
      data: [
        {
          type: "SEND_EMAIL",
          payload: { to: "one@example.com" },
          status: "PENDING",
        },
        {
          type: "GENERATE_REPORT",
          payload: { reportId: "report-2" },
          status: "COMPLETED",
        },
      ],
    });

    const response = await request(app)
      .get("/api/v1/jobs?status=PENDING");

    expect(response.status).toBe(200);
    expect(response.body.data.jobs).toHaveLength(1);
    expect(response.body.data.jobs[0].status).toBe("PENDING");
    expect(response.body.data.pagination.total).toBe(1);
  });

  it("filters jobs by type", async () => {
    await prisma.job.createMany({
      data: [
        {
          type: "SEND_EMAIL",
          payload: { to: "one@example.com" },
        },
        {
          type: "PROCESS_FILE",
          payload: { fileId: "file-2" },
        },
      ],
    });

    const response = await request(app)
      .get("/api/v1/jobs?type=SEND_EMAIL");

    expect(response.status).toBe(200);
    expect(response.body.data.jobs).toHaveLength(1);
    expect(response.body.data.jobs[0].type).toBe("SEND_EMAIL");
  });

  it("rejects an unsupported status filter", async () => {
    const response = await request(app)
      .get("/api/v1/jobs?status=UNKNOWN");

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/v1/jobs/:jobId", () => {
  it("cancels a pending job", async () => {
    const job = await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        payload: { to: "user@example.com" },
      },
    });

    const response = await request(app)
      .delete(`/api/v1/jobs/${job.id}`);

    expect(response.status).toBe(200);
    expect(response.body.message)
      .toBe("Job cancelled successfully");

    const updatedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(updatedJob.status).toBe("CANCELLED");
  });

  it("returns 404 for a missing job", async () => {
    const missingId = "00000000-0000-4000-8000-000000000000";

    const response = await request(app)
      .delete(`/api/v1/jobs/${missingId}`);

    expect(response.status).toBe(404);
  });

  it("rejects cancellation of a processing job", async () => {
    const job = await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        payload: { to: "user@example.com" },
        status: "PROCESSING",
      },
    });

    const response = await request(app)
      .delete(`/api/v1/jobs/${job.id}`);

    expect(response.status).toBe(409);
    expect(response.body.message)
      .toBe("Job cannot be cancelled");

    const unchangedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(unchangedJob.status).toBe("PROCESSING");
  });

  it("rejects cancellation of a completed job", async () => {
    const job = await prisma.job.create({
      data: {
        type: "SEND_EMAIL",
        payload: { to: "user@example.com" },
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    const response = await request(app)
      .delete(`/api/v1/jobs/${job.id}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Job cannot be cancelled");
    expect(response.body.data.currentStatus).toBe("COMPLETED");

    const unchangedJob = await prisma.job.findUnique({
      where: { id: job.id },
    });

    expect(unchangedJob.status).toBe("COMPLETED");
  });
});

describe("Job idempotency", () => {
  const idempotencyKey = "test-idempotency-email-001";

  const payload = {
    type: "SEND_EMAIL",
    payload: {
      to: "test@example.com",
      subject: "Welcome",
    },
  };

  it("returns the existing job for an identical request", async () => {
    const firstResponse = await request(app)
      .post("/api/v1/jobs")
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    const secondResponse = await request(app)
      .post("/api/v1/jobs")
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);

    expect(secondResponse.body.data.job.id).toBe(
      firstResponse.body.data.job.id,
    );
  });

  it("returns 409 when a key is reused with a different payload", async () => {
    const firstResponse = await request(app)
      .post("/api/v1/jobs")
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    const conflictingResponse = await request(app)
      .post("/api/v1/jobs")
      .set("Idempotency-Key", idempotencyKey)
      .send({
        ...payload,
        payload: {
          to: "different@example.com",
          subject: "Different message",
        },
      });

    expect(firstResponse.status).toBe(201);
    expect(conflictingResponse.status).toBe(409);
  });

  it("creates separate jobs when no idempotency key is provided", async () => {
    const firstResponse = await request(app)
      .post("/api/v1/jobs")
      .send(payload);

    const secondResponse = await request(app)
      .post("/api/v1/jobs")
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    expect(firstResponse.body.data.job.id).not.toBe(
      secondResponse.body.data.job.id,
    );
  });

  it("creates only one job for concurrent requests with the same key", async () => {
    const key = "test-idempotency-concurrent-001";

    const payload = {
      type: "SEND_EMAIL",
      payload: {
        to: "concurrent@example.com",
        subject: "Concurrent request test",
      },
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/v1/jobs")
          .set("Idempotency-Key", key)
          .send(payload),
      ),
    );

    // One request creates the job; the rest reuse it.
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(4);

    const jobIds = responses.map((response) => response.body.data.job.id);

    expect(new Set(jobIds).size).toBe(1);

    // Confirm the database contains exactly one job for this key.
    const matchingJobs = await prisma.job.findMany({
      where: { idempotencyKey: key },
      select: { id: true },
    });

    expect(matchingJobs).toHaveLength(1);
  });
});

describe("GET /api/v1/jobs/stats", () => {
  it("returns queue statistics with all job statuses", async () => {
    const response = await request(app).get("/api/v1/jobs/stats");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");

    const stats = response.body.data.stats;

    expect(stats.counts).toEqual(
      expect.objectContaining({
        PENDING: expect.any(Number),
        PROCESSING: expect.any(Number),
        COMPLETED: expect.any(Number),
        FAILED: expect.any(Number),
        CANCELLED: expect.any(Number),
      }),
    );

    expect(stats.total).toBe(
      Object.values(stats.counts).reduce((sum, count) => sum + count, 0),
    );

    expect(stats.durationMs).toEqual(
      expect.objectContaining({
        sampleSize: expect.any(Number),
      }),
    );
  });
});