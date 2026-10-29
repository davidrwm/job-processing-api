# TaskFlow API

A background job processing REST API built with **Node.js, Express, PostgreSQL, and Prisma**. TaskFlow allows clients to submit jobs for asynchronous processing, schedule execution, track job status, and retry failed jobs.

The project uses PostgreSQL as its job queue backend and is designed to explore core background-processing concepts before a future migration to BullMQ and Redis.

## Features

- **Job management** — create, retrieve, list, and cancel background jobs.
- **Scheduled execution** — schedule jobs to run at a specified time.
- **PostgreSQL-backed queue** — persist jobs and queue state in PostgreSQL.
- **Concurrent processing** — claim jobs safely using PostgreSQL transactions and `FOR UPDATE SKIP LOCKED`.
- **Retry handling** — retry failed jobs with exponential backoff and a configurable maximum number of attempts.
- **Job recovery** — detect stale processing jobs and recover them.
- **Idempotent job creation** — use the `Idempotency-Key` header to prevent duplicate jobs from repeated requests.
- **Execution timeouts** — prevent individual job handlers from running indefinitely.
- **Job cancellation** — cancel jobs that have not started processing.
- **Job statistics** — view counts by status and execution-duration metrics.
- **Automatic cleanup** — remove eligible old jobs according to retention policies.
- **API documentation** — explore endpoints through Swagger UI.
- **Automated tests** — test API endpoints and background-processing behavior.

## Tech Stack

- JavaScript (ES modules)
- Node.js
- Express.js
- PostgreSQL
- Prisma ORM 7
- Zod
- Swagger UI Express
- Swagger JSDoc
- Vitest
- Supertest

## Prerequisites

Install the following before running the project:

- Node.js and npm
- PostgreSQL
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/davidrwm/job-processing-api
cd job-processing-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env` in the project root:

```env
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/taskflow_db?schema=public"
PORT=3000
NODE_ENV=development
```

Create a separate `.env.test` file for testing:

```env
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/taskflow_test_db?schema=public"
PORT=3001
NODE_ENV=test
```

Replace the database credentials with your local PostgreSQL credentials. Make sure both databases exist.

### 4. Apply database migrations

Run the development migration:

```bash
npx prisma migrate dev
```

Generate the Prisma client:

```bash
npx prisma generate
```

Use the appropriate environment configuration when preparing the test database. Do not run development migrations against your production database.

### 5. Start the API server

```bash
npm run dev
```

The API runs at:

`http://localhost:3000`

Check its health endpoint:

`http://localhost:3000/api/v1/health`

Expected response:

```json
{
  "status": "success",
  "message": "TaskFlow API is running"
}
```

### 6. Start the background worker

Open a second terminal in the project directory:

```bash
npm run worker
```

The worker polls PostgreSQL for eligible jobs, processes them, handles retries, recovers stale jobs, and performs periodic cleanup.

Keep the API and worker running in separate terminals during local development.

## API Documentation

Swagger UI is available at:

`http://localhost:3000/api-docs`

Use the interactive documentation to inspect endpoints, review request and response schemas, and send test requests.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/health` | Check API health |
| POST | `/api/v1/jobs` | Create a background job |
| GET | `/api/v1/jobs` | List jobs with pagination and filters |
| GET | `/api/v1/jobs/stats` | Retrieve job statistics |
| GET | `/api/v1/jobs/:jobId` | Retrieve a job by ID |
| DELETE | `/api/v1/jobs/:jobId` | Cancel a pending job |

### Supported Job Types

| Job type | Required payload fields |
|---|---|
| `SEND_EMAIL` | `to`, `subject` |
| `GENERATE_REPORT` | `reportId` |
| `PROCESS_FILE` | `fileId` |

These handlers currently simulate work. They demonstrate the job-processing lifecycle without requiring external email, reporting, or file-processing services.

### Example: Create a Job

Send a `POST` request to `/api/v1/jobs` with this JSON body:

```json
{
  "type": "SEND_EMAIL",
  "payload": {
    "to": "user@example.com",
    "subject": "Your report is ready"
  },
  "maxAttempts": 3
}
```

You can optionally provide an `Idempotency-Key` header to make repeated submissions with the same request safe from duplicate job creation.

## Running Tests

Run the automated test suite:

```bash
npm test
```

The tests use the database configured in `.env.test`. Keep the test database separate from development data.

## Background Processing Concepts

This project explores several important backend concepts:

- Asynchronous job execution
- Database-backed queue design
- Concurrent job claiming
- Retry policies and exponential backoff
- Idempotency
- Execution timeouts
- Stale-job recovery
- Graceful worker shutdown
- Job retention and cleanup
- Automated testing of failure and concurrency scenarios

## Future Improvements

- Replace the PostgreSQL-backed queue with BullMQ and Redis.
- Integrate real email, report-generation, and file-processing services.
- Add authentication and authorization if the API will be exposed to external clients.
- Deploy the API, worker, and database to a suitable hosting environment.