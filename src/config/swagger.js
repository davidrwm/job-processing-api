import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "TaskFlow API",
      version: "1.0.0",
      description:
        "A background job processing API built with Node.js, Express, PostgreSQL, and Prisma.",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],
    tags: [
      {
        name: "Health",
        description: "API health checks",
      },
      {
        name: "Jobs",
        description: "Create, schedule, inspect, and cancel background jobs",
      },
    ],
    components: {
      schemas: {
        JobType: {
          type: "string",
          enum: [
            "SEND_EMAIL",
            "GENERATE_REPORT",
            "PROCESS_FILE",
          ],
        },
        JobStatus: {
          type: "string",
          enum: [
            "PENDING",
            "PROCESSING",
            "COMPLETED",
            "FAILED",
            "CANCELLED",
          ],
        },
        ErrorResponse: {
          type: "object",
          required: ["status", "message"],
          properties: {
            status: {
              type: "string",
              example: "error",
            },
            message: {
              type: "string",
              example: "Job not found",
            },
          },
        },
        ValidationErrorResponse: {
          type: "object",
          required: ["status", "message", "errors"],
          properties: {
            status: {
              type: "string",
              example: "error",
            },
            message: {
              type: "string",
              example: "Validation failed",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: {
                    type: "string",
                    example: "invalid_type",
                  },
                  message: {
                    type: "string",
                    example: "Invalid input",
                  },
                  path: {
                    type: "array",
                    items: {
                      oneOf: [
                        { type: "string" },
                        { type: "integer" },
                      ],
                    },
                  },
                },
              },
            },
          },
        },        
        JobCreated: {
          type: "object",
          required: [
            "id",
            "type",
            "payload",
            "status",
            "attempts",
            "maxAttempts",
            "runAt",
            "createdAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            type: { $ref: "#/components/schemas/JobType" },
            payload: {
              type: "object",
              additionalProperties: true,
            },
            status: { $ref: "#/components/schemas/JobStatus" },
            attempts: { type: "integer", example: 0 },
            maxAttempts: { type: "integer", example: 3 },
            runAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },

        JobListItem: {
          type: "object",
          required: [
            "id",
            "type",
            "status",
            "attempts",
            "maxAttempts",
            "runAt",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            type: { $ref: "#/components/schemas/JobType" },
            status: { $ref: "#/components/schemas/JobStatus" },
            attempts: { type: "integer", example: 0 },
            maxAttempts: { type: "integer", example: 3 },
            runAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },

        Job: {
          type: "object",
          required: [
            "id",
            "type",
            "payload",
            "status",
            "attempts",
            "maxAttempts",
            "runAt",
            "startedAt",
            "completedAt",
            "failedAt",
            "durationMs",
            "idempotencyKey",
            "requestHash",
            "lastError",
            "lockedAt",
            "lockToken",
            "createdAt",
            "updatedAt",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            type: { $ref: "#/components/schemas/JobType" },
            payload: {
              type: "object",
              additionalProperties: true,
            },
            status: { $ref: "#/components/schemas/JobStatus" },
            idempotencyKey: { type: "string", nullable: true },
            requestHash: { type: "string", nullable: true },
            attempts: { type: "integer", example: 0 },
            maxAttempts: { type: "integer", example: 3 },
            runAt: { type: "string", format: "date-time" },
            startedAt: { type: "string", format: "date-time", nullable: true },
            completedAt: { type: "string", format: "date-time", nullable: true },
            failedAt: { type: "string", format: "date-time", nullable: true },
            durationMs: { type: "integer", nullable: true, example: 1250 },
            lastError: { type: "string", nullable: true },
            lockedAt: { type: "string", format: "date-time", nullable: true },
            lockToken: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: [
    "./src/app.js",
    "./src/modules/jobs/job.routes.js",
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;