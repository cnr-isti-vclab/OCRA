-- AlterTable
ALTER TABLE "users"
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "disabledBy" TEXT,
ADD COLUMN     "disableReason" TEXT;