-- Add monotonic per-project counter
ALTER TABLE "projects"
ADD COLUMN "counter" BIGINT NOT NULL DEFAULT 0;
