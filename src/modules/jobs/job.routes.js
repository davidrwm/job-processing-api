import { Router } from "express";

import {
  createJob,
  listJobs,
  getJobById,
  cancelJob,
  getJobStatsController
} from "./job.controller.js";

import {
  validateCreateJob,
  validateListJobs,
  validateJobId,
} from "./job.validator.js";

const router = Router();

/**
 * @openapi
 * /api/v1/jobs:
 *   post:
 *     tags:
 *       - Jobs
 *     summary: Create a background job
 *     description: >
 *       Creates a job for asynchronous processing. Optionally accepts an
 *       Idempotency-Key header to prevent duplicate jobs when the same
 *       request is submitted more than once.
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: false
 *         description: >
 *           A client-provided key used to identify duplicate requests.
 *           Reusing the key with the same request returns the existing job.
 *           Reusing it with a different request returns a conflict.
 *         schema:
 *           type: string
 *           maxLength: 255
 *         example: create-report-123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - payload
 *             properties:
 *               type:
 *                 $ref: '#/components/schemas/JobType'
 *               payload:
 *                 type: object
 *                 description: >
 *                   Job-specific data. SEND_EMAIL requires to and subject;
 *                   GENERATE_REPORT requires reportId; PROCESS_FILE requires fileId.
 *                 additionalProperties: true
 *               maxAttempts:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 3
 *               runAt:
 *                 type: string
 *                 format: date-time
 *                 description: Optional scheduled execution time in ISO 8601 format.
 *           examples:
 *             sendEmail:
 *               summary: Send an email
 *               value:
 *                 type: SEND_EMAIL
 *                 payload:
 *                   to: user@example.com
 *                   subject: Your report is ready
 *                 maxAttempts: 3
 *             generateReport:
 *               summary: Generate a report
 *               value:
 *                 type: GENERATE_REPORT
 *                 payload:
 *                   reportId: report-123
 *             processFile:
 *               summary: Process a file
 *               value:
 *                 type: PROCESS_FILE
 *                 payload:
 *                   fileId: file-123
 *     responses:
 *       "201":
 *         description: Job created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - data
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     job:
 *                       $ref: '#/components/schemas/JobCreated'
 *       "200":
 *         description: An existing job was returned for an idempotent request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     job:
 *                       $ref: '#/components/schemas/JobCreated'
 *       "400":
 *         description: Request body validation failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       "409":
 *         description: The idempotency key was already used with a different request.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", validateCreateJob, createJob);

/**
 * @openapi
 * /api/v1/jobs:
 *   get:
 *     tags:
 *       - Jobs
 *     summary: List background jobs
 *     description: Returns a paginated list of jobs, optionally filtered by status or job type.
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number (starts at 1).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         example: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of jobs per page.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         example: 10
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter jobs by their current status.
 *         schema:
 *           $ref: '#/components/schemas/JobStatus'
 *       - in: query
 *         name: type
 *         required: false
 *         description: Filter jobs by job type.
 *         schema:
 *           $ref: '#/components/schemas/JobType'
 *     responses:
 *       "200":
 *         description: Jobs retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - data
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   required:
 *                     - jobs
 *                     - pagination
 *                   properties:
 *                     jobs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/JobListItem'
 *                     pagination:
 *                       type: object
 *                       required:
 *                         - page
 *                         - limit
 *                         - total
 *                         - totalPages
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 25
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       "400":
 *         description: Invalid pagination or filter parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
router.get("/", validateListJobs, listJobs);

/**
 * @openapi
 * /api/v1/jobs/stats:
 *   get:
 *     tags:
 *       - Jobs
 *     summary: Get job processing statistics
 *     description: >
 *       Returns job counts grouped by status, the total number of jobs,
 *       and execution-duration statistics for jobs with recorded durations.
 *     responses:
 *       "200":
 *         description: Job statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - data
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   required:
 *                     - stats
 *                   properties:
 *                     stats:
 *                       type: object
 *                       required:
 *                         - counts
 *                         - total
 *                         - durationMs
 *                       properties:
 *                         counts:
 *                           type: object
 *                           description: Number of jobs in each status.
 *                           additionalProperties:
 *                             type: integer
 *                           example:
 *                             PENDING: 4
 *                             PROCESSING: 1
 *                             COMPLETED: 20
 *                             FAILED: 2
 *                             CANCELLED: 1
 *                         total:
 *                           type: integer
 *                           description: Total number of jobs across all statuses.
 *                           example: 28
 *                         durationMs:
 *                           type: object
 *                           required:
 *                             - sampleSize
 *                             - average
 *                             - min
 *                             - max
 *                           properties:
 *                             sampleSize:
 *                               type: integer
 *                               description: Number of jobs included in duration calculations.
 *                               example: 20
 *                             average:
 *                               type: number
 *                               nullable: true
 *                               description: Average execution duration in milliseconds.
 *                               example: 1250.5
 *                             min:
 *                               type: integer
 *                               nullable: true
 *                               description: Minimum execution duration in milliseconds.
 *                               example: 800
 *                             max:
 *                               type: integer
 *                               nullable: true
 *                               description: Maximum execution duration in milliseconds.
 *                               example: 2500
 */
router.get("/stats", getJobStatsController);

/**
 * @openapi
 * /api/v1/jobs/{jobId}:
 *   get:
 *     tags:
 *       - Jobs
 *     summary: Get a job by ID
 *     description: Retrieves the details and current status of a specific background job.
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         description: UUID of the job to retrieve.
 *         schema:
 *           type: string
 *           format: uuid
 *         example: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       "200":
 *         description: Job retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - data
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   required:
 *                     - job
 *                   properties:
 *                     job:
 *                       $ref: '#/components/schemas/Job'
 *       "400":
 *         description: The supplied job ID is not a valid UUID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "404":
 *         description: No job exists with the supplied ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:jobId", validateJobId, getJobById);

/**
 * @openapi
 * /api/v1/jobs/{jobId}:
 *   delete:
 *     tags:
 *       - Jobs
 *     summary: Cancel a pending job
 *     description: >
 *       Cancels a job that is still PENDING. Jobs that are already processing
 *       or have reached a terminal status cannot be cancelled.
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         description: UUID of the job to cancel.
 *         schema:
 *           type: string
 *           format: uuid
 *         example: 550e8400-e29b-41d4-a716-446655440000
 *     responses:
 *       "200":
 *         description: Job cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Job cancelled successfully
 *       "400":
 *         description: The supplied job ID is not a valid UUID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "404":
 *         description: No job exists with the supplied ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       "409":
 *         description: The job exists but cannot be cancelled in its current status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - message
 *                 - data
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Job cannot be cancelled
 *                 data:
 *                   type: object
 *                   properties:
 *                     currentStatus:
 *                       $ref: '#/components/schemas/JobStatus'
 */
router.delete("/:jobId", validateJobId, cancelJob);

export default router;