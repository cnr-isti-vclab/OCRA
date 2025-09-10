/*
  Warnings:

  - Added the required column `eventType` to the `login_events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."login_events" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "eventType" TEXT NOT NULL,
ADD COLUMN     "sessionId" TEXT;
