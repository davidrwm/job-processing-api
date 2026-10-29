import { afterEach, describe, expect, it, vi } from "vitest";

import { executeJob } from "../src/modules/jobs/job.handlers.js";
import { executeJobWithTimeout } from "../src/modules/jobs/job.executor.js";

vi.mock("../src/modules/jobs/job.handlers.js", () => ({
  executeJob: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

describe("Job execution timeout", () => {
  it("passes an abort signal to the handler", async () => {
    executeJob.mockResolvedValueOnce(undefined);

    await executeJobWithTimeout({
      type: "SEND_EMAIL",
      payload: {
        to: "test@example.com",
        subject: "Test",
      },
    });

    expect(executeJob).toHaveBeenCalledOnce();

    const [, options] = executeJob.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it("rejects when the handler exceeds its configured timeout", {timeout: 100000}, async () => {
    executeJob.mockImplementationOnce(
      (_job, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Job execution timed out")),
            { once: true },
          );
        }),
    );

    await expect(
      executeJobWithTimeout({
        type: "SEND_EMAIL",
        payload: {
          to: "test@example.com",
          subject: "Test",
        },
      }),
    ).rejects.toThrow("Job execution timed out");

    const [, options] = executeJob.mock.calls[0];
    expect(options.signal.aborted).toBe(true);
  });

  it("rejects job types without a configured timeout", async () => {
    await expect(
      executeJobWithTimeout({
        type: "UNKNOWN_JOB",
        payload: {},
      }),
    ).rejects.toThrow("No timeout configured");
  });
});