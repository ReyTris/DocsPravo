-- CreateEnum
CREATE TYPE "DocumentTier" AS ENUM ('green', 'yellow', 'red');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentStatus" ADD VALUE 'ready_green';
ALTER TYPE "DocumentStatus" ADD VALUE 'ready_yellow';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "tier" "DocumentTier";
