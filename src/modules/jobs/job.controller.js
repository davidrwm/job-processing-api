import {
  createJob as createJobService,
  listJobs as listJobsService,
  getJobById as getJobByIdService,
  cancelJob as cancelJobService,
  createJobIdempotently,
  getJobStats
} from "./job.service.js";

export async function createJob(req, res, next) {
  try {
    const idempotencyKey = req.get("Idempotency-Key");

    if (!idempotencyKey) {
      const job = await createJobService(req.validatedBody);

      return res.status(201).json({
        status: "success",
        data: { job },
      });
    }

    const result = await createJobIdempotently(
      req.validatedBody,
      idempotencyKey,
    );

    return res.status(result.created ? 201 : 200).json({
      status: "success",
      data: { job: result.job },
    });
  } catch (error) {
    next(error);
  }
}

export async function listJobs(req, res, next) {
  try {
    const result = await listJobsService(req.validatedQuery);

    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getJobById(req, res, next) {
  try {
    const job = await getJobByIdService(req.validatedJobId);

    if (!job) {
      return res.status(404).json({
        status: "error",
        message: "Job not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: { job },
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelJob(req, res, next) {
  try {
    const result = await cancelJobService(
      req.validatedJobId
    );

    if (result.outcome === "not_found") {
      return res.status(404).json({
        status: "error",
        message: "Job not found",
      });
    }

    if (result.outcome === "not_cancellable") {
      return res.status(409).json({
        status: "error",
        message: "Job cannot be cancelled",
        data: {
          currentStatus: result.currentStatus,
        },
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Job cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function getJobStatsController(req, res, next) {
  try {
    const stats = await getJobStats();

    return res.status(200).json({
      status: "success",
      data: { stats },
    });
  } catch (error) {
    next(error);
  }
}