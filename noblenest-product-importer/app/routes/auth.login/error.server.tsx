import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Vul je winkeldomein in om in te loggen" };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Vul een geldig winkeldomein in (bijv. jouw-winkel.myshopify.com)" };
  }
  return {};
}
