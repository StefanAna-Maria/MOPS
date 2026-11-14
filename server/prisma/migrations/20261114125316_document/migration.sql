-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "total" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "note" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_line" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "document_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_userId_date_idx" ON "document"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "document_userId_clientRequestId_key" ON "document"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "document_line_documentId_idx" ON "document_line"("documentId");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_line" ADD CONSTRAINT "document_line_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
