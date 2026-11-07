import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const meta: MetaFunction = () => [{ title: "Inloggen — Noblenest" }, { name: "robots", content: "noindex" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;

  return (
    <>
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" />
      <s-page heading="Noblenest" inlineSize="small">
        <Form method="post">
          <s-section heading="Inloggen">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="shop"
                label="Winkeldomein"
                details="jouw-winkel.myshopify.com"
                autocomplete="on"
                error={errors.shop}
              ></s-text-field>
              <s-button type="submit" variant="primary">
                Inloggen
              </s-button>
            </s-stack>
          </s-section>
        </Form>
      </s-page>
    </>
  );
}
