-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('API', 'FEED', 'FILE', 'MANUAL', 'SHOPIFY');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('AVAILABLE', 'REQUIRES_CREDENTIALS', 'REQUIRES_APPROVAL', 'NOT_AVAILABLE', 'PLANNED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SupplierProductStatus" AS ENUM ('NEW', 'IMPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ImageRightsStatus" AS ENUM ('UNVERIFIED', 'CONFIRMED_BY_SUPPLIER', 'CONFIRMED_BY_MERCHANT', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('CSV', 'XML', 'JSON', 'URL', 'URL_BATCH', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PREVIEW', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('PENDING', 'IMPORTING', 'IMPORTED', 'SKIPPED_DUPLICATE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncMode" AS ENUM ('STOCK', 'PRICE', 'BOTH');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "PricingScope" AS ENUM ('GLOBAL', 'CATEGORY', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "PricingStrategy" AS ENUM ('FIXED_MARKUP', 'PERCENTAGE_MARKUP', 'TARGET_MARGIN');

-- CreateEnum
CREATE TYPE "PriceRounding" AS ENUM ('NONE', 'END_95', 'END_99');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('ANTHROPIC', 'OPENAI');

-- CreateEnum
CREATE TYPE "AITask" AS ENUM ('TITLE', 'DESCRIPTION', 'SEO', 'TRANSLATION', 'TAGS', 'ALT_TEXT', 'FULL');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT,
    "currencyCode" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyUserId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "integrationStatus" "IntegrationStatus" NOT NULL,
    "website" TEXT,
    "description" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierConnection" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "credentialsEncrypted" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "descriptionHtml" TEXT,
    "vendor" TEXT,
    "brand" TEXT,
    "productType" TEXT,
    "tags" TEXT[],
    "gtin" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "costPrice" DECIMAL(12,4),
    "shippingCost" DECIMAL(12,4),
    "deliveryDaysMin" INTEGER,
    "deliveryDaysMax" INTEGER,
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "safetyInfo" TEXT,
    "euResponsiblePerson" TEXT,
    "countryOfOrigin" TEXT,
    "rawData" JSONB NOT NULL,
    "aiTitle" TEXT,
    "aiDescriptionHtml" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "complianceFlags" JSONB,
    "status" "SupplierProductStatus" NOT NULL DEFAULT 'NEW',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "options" JSONB NOT NULL,
    "costPrice" DECIMAL(12,4),
    "stockQuantity" INTEGER,
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "weightGrams" INTEGER,
    "imageSourceUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "shopifyVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "altText" TEXT,
    "aiAltText" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "rightsStatus" "ImageRightsStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "importedToShopify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyProductMapping" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyHandle" TEXT,
    "shopifyStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceKey" TEXT NOT NULL,
    "sellingPrice" DECIMAL(12,2),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "createdById" TEXT,
    "type" "ImportJobType" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PREVIEW',
    "sourceName" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "succeededItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "skippedItems" INTEGER NOT NULL DEFAULT 0,
    "parseErrors" JSONB,
    "imageRightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJobItem" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "pricing" JSONB,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "duplicateOf" TEXT,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "supplierProductId" TEXT,
    "shopifyProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierId" TEXT,
    "mode" "SyncMode" NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "scope" "PricingScope" NOT NULL DEFAULT 'GLOBAL',
    "category" TEXT,
    "supplierId" TEXT,
    "strategy" "PricingStrategy" NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "minimumPrice" DECIMAL(12,2),
    "rounding" "PriceRounding" NOT NULL DEFAULT 'NONE',
    "defaultShippingCost" DECIMAL(12,2),
    "importDutyPercent" DECIMAL(6,3),
    "paymentFeePercent" DECIMAL(6,3),
    "paymentFeeFixed" DECIMAL(12,2),
    "platformFeePercent" DECIMAL(6,3),
    "otherCosts" DECIMAL(12,2),
    "vatPercent" DECIMAL(6,3),
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "supplierProductId" TEXT,
    "provider" "AIProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "task" "AITask" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "valueEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "User_shopId_shopifyUserId_key" ON "User"("shopId", "shopifyUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_key_key" ON "Supplier"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierConnection_shopId_supplierId_key" ON "SupplierConnection"("shopId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierProduct_shopId_sourceUrl_idx" ON "SupplierProduct"("shopId", "sourceUrl");

-- CreateIndex
CREATE INDEX "SupplierProduct_shopId_status_idx" ON "SupplierProduct"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProduct_shopId_supplierId_externalId_key" ON "SupplierProduct"("shopId", "supplierId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_supplierProductId_externalId_key" ON "ProductVariant"("supplierProductId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_supplierProductId_sourceUrl_key" ON "ProductImage"("supplierProductId", "sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProductMapping_supplierProductId_key" ON "ShopifyProductMapping"("supplierProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProductMapping_shopId_shopifyProductId_key" ON "ShopifyProductMapping"("shopId", "shopifyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProductMapping_shopId_sourceKey_key" ON "ShopifyProductMapping"("shopId", "sourceKey");

-- CreateIndex
CREATE INDEX "ImportJob_shopId_createdAt_idx" ON "ImportJob"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJobItem_importJobId_status_idx" ON "ImportJobItem"("importJobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJobItem_importJobId_externalId_key" ON "ImportJobItem"("importJobId", "externalId");

-- CreateIndex
CREATE INDEX "SyncJob_shopId_createdAt_idx" ON "SyncJob"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "PricingRule_shopId_isActive_priority_idx" ON "PricingRule"("shopId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "AIJob_shopId_createdAt_idx" ON "AIJob"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_createdAt_idx" ON "AuditLog"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_shopId_level_idx" ON "AuditLog"("shopId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_shopId_key_key" ON "AppSetting"("shopId", "key");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierConnection" ADD CONSTRAINT "SupplierConnection_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierConnection" ADD CONSTRAINT "SupplierConnection_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyProductMapping" ADD CONSTRAINT "ShopifyProductMapping_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyProductMapping" ADD CONSTRAINT "ShopifyProductMapping_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobItem" ADD CONSTRAINT "ImportJobItem_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobItem" ADD CONSTRAINT "ImportJobItem_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "SupplierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
