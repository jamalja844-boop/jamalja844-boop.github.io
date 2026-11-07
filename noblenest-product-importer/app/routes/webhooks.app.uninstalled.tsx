import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logAudit } from "../services/audit.server";

/**
 * App verwijderd. authenticate.webhook valideert de HMAC-handtekening.
 * Sessies (toegangstokens) worden direct gewist. Winkelgegevens blijven bewaard tot Shopify
 * het shop/redact-verzoek stuurt (48 uur na verwijdering) — zie webhooks.compliance.tsx.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  // Webhooks kunnen meerdere keren binnenkomen; alle stappen zijn idempotent.
  await db.session.deleteMany({ where: { shop } });
  const record = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (record && !record.uninstalledAt) {
    await db.shop.update({ where: { id: record.id }, data: { uninstalledAt: new Date() } });
    await logAudit({ shopId: record.id, action: "app.uninstalled", level: "WARNING", message: "Noblenest is verwijderd uit de winkel; toegangstokens zijn gewist." });
  }
  return new Response();
};
