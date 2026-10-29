import { prisma } from "../../config/prisma.js";
import { createHash } from "node:crypto";

export async function createJob(data) {
  return prisma.job.create({
    data: {
      type: data.type,
      payload: data.payload,
      ...(data.maxAttempts !== undefined && {
        maxAttempts: data.maxAttempts,
      }),
      ...(data.runAt && {
        runAt: new Date(data.runAt),
      }),
    },
    select: {
      id: true,
      type: true,
      payload: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      runAt: true,
      createdAt: true,
    },
  });
}

export async function listJobs({
  page,
  limit,
  status,
  type,
}) {
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
    ...(type && { type }),
  };

  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        type: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        runAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.job.count({ where }),
  ]);

  return {
    jobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getJobById(id) {
  return prisma.job.findUnique({
    where: { id },
  });
}

export async function cancelJob(id) {
  const result = await prisma.job.updateMany({
    where: {
      id,
      status: "PENDING",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (result.count === 1) {
    return { outcome: "cancelled" };
  }

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
    },
  });

  if (!job) {
    return { outcome: "not_found" };
  }

  return {
    outcome: "not_cancellable",
    currentStatus: job.status,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }

  return value;
}

function createRequestHash(data) {
  const normalizedRequest = {
    type: data.type,
    payload: canonicalize(data.payload),
    maxAttempts: data.maxAttempts ?? 3,
    runAt: data.runAt
      ? new Date(data.runAt).toISOString()
      : null,
  };

  return createHash("sha256")
    .update(JSON.stringify(normalizedRequest))
    .digest("hex");
}

const idempotentJobSelect = {
  id: true,
  type: true,
  payload: true,
  status: true,
  attempts: true,
  maxAttempts: true,
  runAt: true,
  createdAt: true,
};

function idempotencyConflict() {
  const error = new Error(
    "Idempotency-Key has already been used for a different request",
  );
  error.statusCode = 409;
  return error;
}

export async function createJobIdempotently(data, idempotencyKey) {
  const key = idempotencyKey.trim();
  const requestHash = createRequestHash(data);

  const existingJob = await prisma.job.findUnique({
    where: { idempotencyKey: key },
    select: {
      ...idempotentJobSelect,
      requestHash: true,
    },
  });

  if (existingJob) {
    if (existingJob.requestHash !== requestHash) {
      throw idempotencyConflict();
    }

    const { requestHash: _, ...job } = existingJob;
    return { job, created: false };
  }

  try {
    const job = await prisma.job.create({
      data: {
        type: data.type,
        payload: data.payload,
        maxAttempts: data.maxAttempts ?? 3,
        runAt: data.runAt ? new Date(data.runAt) : new Date(),
        idempotencyKey: key,
        requestHash,
      },
      select: idempotentJobSelect,
    });

    return { job, created: true };
  } catch (error) {
    // Another request may have inserted this key after our initial lookup.
    if (error.code !== "P2002") {
      throw error;
    }

    const concurrentJob = await prisma.job.findUnique({
      where: { idempotencyKey: key },
      select: {
        ...idempotentJobSelect,
        requestHash: true,
      },
    });

    if (!concurrentJob) {
      throw error;
    }

    if (concurrentJob.requestHash !== requestHash) {
      throw idempotencyConflict();
    }

    const { requestHash: _, ...job } = concurrentJob;
    return { job, created: false };
  }
}

export async function getJobStats() {
  const statuses = [
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ];

  const groupedJobs = await prisma.job.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    statuses.map((status) => [status, 0]),
  );

  for (const group of groupedJobs) {
    counts[group.status] = group._count._all;
  }

  const durationStats = await prisma.job.aggregate({
    where: { durationMs: { not: null } },
    _avg: { durationMs: true },
    _min: { durationMs: true },
    _max: { durationMs: true },
    _count: { _all: true },
  });

  return {
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    durationMs: {
      sampleSize: durationStats._count._all,
      average: durationStats._avg.durationMs,
      min: durationStats._min.durationMs,
      max: durationStats._max.durationMs,
    },
  };
}