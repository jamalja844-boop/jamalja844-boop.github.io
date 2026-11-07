/**
 * Vult het leveranciersregister (idempotent). De app doet dit ook automatisch bij de eerste aanvraag;
 * dit script is handig na een lege database: `npm run db:seed`.
 */
import db from "../app/db.server";
import { ensureSupplierRegistry, SUPPLIER_REGISTRY } from "../app/services/suppliers.server";

await ensureSupplierRegistry();
console.log(`Leveranciersregister bijgewerkt: ${SUPPLIER_REGISTRY.map((s) => s.name).join(", ")}`);
await db.$disconnect();
