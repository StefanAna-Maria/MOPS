-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "cui" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "vatPayer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_ownerId_key" ON "company"("ownerId");

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
