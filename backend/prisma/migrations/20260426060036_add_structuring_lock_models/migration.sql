-- CreateEnum
CREATE TYPE "ProjectConcurrencyMode" AS ENUM ('viewing', 'editing', 'structuring');

-- CreateEnum
CREATE TYPE "StructuringLockState" AS ENUM ('draining', 'exclusive');

-- CreateTable
CREATE TABLE "structuring_locks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerSessionId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "state" "StructuringLockState" NOT NULL,
    "fencingToken" INTEGER NOT NULL DEFAULT 1,
    "operationType" TEXT,
    "operationContext" JSONB,
    "heartbeatExpiresAt" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structuring_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_presence_leases" (
    "id" TEXT NOT NULL,
    "leaseKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "ProjectConcurrencyMode" NOT NULL,
    "sceneId" TEXT,
    "clientInstanceId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "heartbeatExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_presence_leases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "structuring_locks_projectId_key" ON "structuring_locks"("projectId");

-- CreateIndex
CREATE INDEX "structuring_locks_ownerSessionId_idx" ON "structuring_locks"("ownerSessionId");

-- CreateIndex
CREATE INDEX "structuring_locks_heartbeatExpiresAt_idx" ON "structuring_locks"("heartbeatExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_presence_leases_leaseKey_key" ON "project_presence_leases"("leaseKey");

-- CreateIndex
CREATE INDEX "project_presence_leases_projectId_heartbeatExpiresAt_idx" ON "project_presence_leases"("projectId", "heartbeatExpiresAt");

-- CreateIndex
CREATE INDEX "project_presence_leases_projectId_mode_heartbeatExpiresAt_idx" ON "project_presence_leases"("projectId", "mode", "heartbeatExpiresAt");

-- CreateIndex
CREATE INDEX "project_presence_leases_sessionId_idx" ON "project_presence_leases"("sessionId");

-- AddForeignKey
ALTER TABLE "structuring_locks" ADD CONSTRAINT "structuring_locks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structuring_locks" ADD CONSTRAINT "structuring_locks_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_presence_leases" ADD CONSTRAINT "project_presence_leases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_presence_leases" ADD CONSTRAINT "project_presence_leases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
