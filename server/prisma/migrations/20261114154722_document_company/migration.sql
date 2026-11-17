-- DropIndex
DROP INDEX "document_userId_date_idx";

-- AlterTable
ALTER TABLE "document" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE INDEX "document_userId_companyId_date_idx" ON "document"("userId", "companyId", "date");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
