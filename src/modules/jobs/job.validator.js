import { z } from "zod";

export const jobTypeSchema = z.enum([
  "SEND_EMAIL",
  "GENERATE_REPORT",
  "PROCESS_FILE",
]);

export const jobStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const createJobSchema = z.object({
  type: jobTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  maxAttempts: z.number().int().min(1).max(10).optional(),
  runAt: z.iso.datetime().optional(),
});

export const listJobsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: jobStatusSchema.optional(),
  type: jobTypeSchema.optional(),
});

export const jobIdSchema = z.uuid();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "Idempotency-Key cannot be empty")
  .max(255, "Idempotency-Key must be at most 255 characters");



export function validateCreateJob(req, res, next) {
  const result = createJobSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: result.error.issues,
    });
  }

  req.validatedBody = result.data;
  next();
}

export function validateListJobs(req, res, next) {
  const result = listJobsSchema.safeParse(req.query);

  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: result.error.issues,
    });
  }

  req.validatedQuery = result.data;
  next();
}

export function validateJobId(req, res, next) {
  const result = jobIdSchema.safeParse(req.params.jobId);

  if (!result.success) {
    return res.status(400).json({
      status: "error",
      message: "Invalid job ID",
    });
  }

  req.validatedJobId = result.data;
  next();
}