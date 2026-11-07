/**
 * Authenticatie en winkelcontext voor elke beveiligde route.
 * - authenticate.admin valideert de Shopify-sessie (session token / token exchange).
 * - De winkel en gebruiker worden in de eigen database vastgelegd; alle verdere queries
 *   filteren op shop.id (autorisatie per winkel).
 */
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { runGraphql, type AdminGraphqlClient } from "./graphql.server";
import { ensureSupplierRegistry } from "./suppliers.server";

const SHOP_INFO_QUERY = `#graphql
  query NoblenestShopInfo {
    shop {
      name
      currencyCode
    }
  }
`;

export async function requireShop(request: Request) {
  const context = await authenticate.admin(request);
  const { admin, session } = context;
  const client = admin.graphql as unknown as AdminGraphqlClient;

  let shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop || shop.uninstalledAt || !shop.currencyCode) {
    const info = await runGraphql<{ shop: { name: string; currencyCode: string } }>(client, SHOP_INFO_QUERY);
    shop = await db.shop.upsert({
      where: { shopDomain: session.shop },
      create: { shopDomain: session.shop, name: info.data?.shop.name ?? null, currencyCode: info.data?.shop.currencyCode ?? null },
      update: {
        uninstalledAt: null,
        ...(info.data ? { name: info.data.shop.name, currencyCode: info.data.shop.currencyCode } : {}),
      },
    });
    await ensureSupplierRegistry();
  }

  // Gebruiker uit het session token (embedded apps). sub = Shopify-gebruikers-ID.
  const sub = "sessionToken" in context ? (context.sessionToken as { sub?: string } | undefined)?.sub : undefined;
  let user = null;
  if (sub) {
    user = await db.user.upsert({
      where: { shopId_shopifyUserId: { shopId: shop.id, shopifyUserId: String(sub) } },
      create: { shopId: shop.id, shopifyUserId: String(sub) },
      update: { lastSeenAt: new Date() },
    });
  }

  return { admin, client, session, shop, user, redirect: "redirect" in context ? context.redirect : undefined };
}
