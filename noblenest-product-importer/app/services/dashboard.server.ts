import db from "../db.server";

export async function getDashboardStats(shopId: string) {
  const [imported, drafts, active, withoutImage, syncErrors, failedImportItems, recentJobs, pricingRules] = await Promise.all([
    db.shopifyProductMapping.count({ where: { shopId } }),
    db.shopifyProductMapping.count({ where: { shopId, shopifyStatus: "DRAFT" } }),
    db.shopifyProductMapping.count({ where: { shopId, shopifyStatus: "ACTIVE" } }),
    db.shopifyProductMapping.count({
      where: { shopId, supplierProduct: { images: { none: { importedToShopify: true } } } },
    }),
    db.syncJob.count({ where: { shopId, status: { in: ["FAILED", "COMPLETED_WITH_ERRORS"] } } }),
    db.importJobItem.count({ where: { importJob: { shopId }, status: "FAILED" } }),
    db.importJob.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.pricingRule.count({ where: { shopId, isActive: true } }),
  ]);
  return { imported, drafts, active, withoutImage, syncErrors, failedImportItems, recentJobs, pricingRules };
}
