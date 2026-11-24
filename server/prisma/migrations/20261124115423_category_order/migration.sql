-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "categoryOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
