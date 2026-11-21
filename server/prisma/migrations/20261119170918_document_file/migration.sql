-- AlterTable
ALTER TABLE "document" ADD COLUMN     "fileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "document_fileId_key" ON "document"("fileId");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

