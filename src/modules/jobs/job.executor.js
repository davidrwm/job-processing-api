import { executeJob } from "./job.handlers.js";

export const JOB_TIMEOUTS_MS = {
  SEND_EMAIL: 5_000,
  GENERATE_REPORT: 10_000,
  PROCESS_FILE: 15_000,
};

export async function executeJobWithTimeout(job) {
  const timeoutMs = JOB_TIMEOUTS_MS[job.type];

  if (!timeoutMs) {
    throw new Error(`No timeout configured for job type: ${job.type}`);
  }

  const controller = new AbortController();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Job execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      executeJob(job, { signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}