-- DropIndex
DROP INDEX "SupplierConnection_shopId_supplierId_key";

-- AlterTable
ALTER TABLE "SupplierConnection" ADD COLUMN     "config" JSONB,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "SupplierConnection_shopId_idx" ON "SupplierConnection"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierConnection_shopId_supplierId_name_key" ON "SupplierConnection"("shopId", "supplierId", "name");

