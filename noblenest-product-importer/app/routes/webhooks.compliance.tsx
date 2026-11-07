import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logAudit } from "../services/audit.server";

/**
 * Verplichte AVG/GDPR-compliancewebhooks (HMAC gevalideerd door authenticate.webhook).
 *
 * Noblenest slaat geen klantgegevens (klanten, bestellingen) op. Daarom:
 * - customers/data_request: er zijn geen klantgegevens om te leveren; verzoek wordt gelogd.
 * - customers/redact:       er zijn geen klantgegevens om te wissen; verzoek wordt gelogd.
 * - shop/redact:            alle gegevens van de winkel worden permanent verwijderd.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const record = await db.shop.findUnique({ where: { shopDomain: shop } });

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      if (record) {
        await logAudit({
          shopId: record.id,
          action: `compliance.${topic.toLowerCase()}`,
          message:
            topic === "CUSTOMERS_DATA_REQUEST"
              ? "AVG-inzageverzoek ontvangen: Noblenest bewaart geen klantgegevens."
              : "AVG-verwijderverzoek voor een klant ontvangen: Noblenest bewaart geen klantgegevens.",
        });
      }
      break;
    case "SHOP_REDACT":
      await db.session.deleteMany({ where: { shop } });
      if (record) {
        // Cascade verwijdert alle gekoppelde gegevens (producten, imports, logboek, instellingen, sleutels).
        await db.shop.delete({ where: { id: record.id } });
      }
      break;
    default:
      return new Response("Onbekend onderwerp", { status: 400 });
  }
  return new Response();
};
