function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Job execution timed out"));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      cleanup();
      reject(new Error("Job execution timed out"));
    }

    function cleanup() {
      signal?.removeEventListener("abort", onAbort);
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function sendEmail(payload, signal) {
  if (!payload.to || !payload.subject) {
    throw new Error("Email recipient and subject are required");
  }

  await sleep(1000, signal);
  console.log(`Simulated email sent to ${payload.to}`);
}

async function generateReport(payload, signal) {
  if (!payload.reportId) {
    throw new Error("Report ID is required");
  }

  await sleep(1500, signal);
  console.log(`Simulated report generated: ${payload.reportId}`);
}

async function processFile(payload, signal) {
  if (!payload.fileId) {
    throw new Error("File ID is required");
  }

  await sleep(2000, signal);
  console.log(`Simulated file processed: ${payload.fileId}`);
}

export async function executeJob(job, { signal } = {}) {
  switch (job.type) {
    case "SEND_EMAIL":
      return sendEmail(job.payload, signal);
    case "GENERATE_REPORT":
      return generateReport(job.payload, signal);
    case "PROCESS_FILE":
      return processFile(job.payload, signal);
    default:
      throw new Error(`Unsupported job type: ${job.type}`);
  }
}