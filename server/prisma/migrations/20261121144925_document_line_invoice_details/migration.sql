-- AlterTable
ALTER TABLE "document_line" ADD COLUMN     "quantity" DECIMAL(12,3),
ADD COLUMN     "unitPrice" DECIMAL(12,2),
ADD COLUMN     "vatAmount" DECIMAL(12,2);
