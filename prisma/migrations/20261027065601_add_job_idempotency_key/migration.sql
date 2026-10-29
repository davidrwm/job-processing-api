/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `jobs` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "idempotencyKey" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_idempotencyKey_key" ON "jobs"("idempotencyKey");
