import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "Noblenest — productimport voor Shopify" },
  { name: "description", content: "Noblenest importeert leveranciersproducten veilig als concept in je Shopify-winkel, met prijsberekening, kwaliteitscontrole en Nederlandse teksten." },
  { name: "robots", content: "noindex" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function Landing() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Productimport voor Shopify</p>
        <h1 className={styles.wordmark}>Noblenest</h1>
        <p className={styles.tagline}>
          Leveranciersproducten zorgvuldig voorbereid voor je winkel — met heldere prijzen, gecontroleerde gegevens en
          Nederlandse teksten. Alles eerst als concept, niets zonder jouw akkoord.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Winkeldomein</span>
              <input className={styles.input} type="text" name="shop" placeholder="jouw-winkel.myshopify.com" autoComplete="on" required />
            </label>
            <button className={styles.button} type="submit">
              Inloggen
            </button>
          </Form>
        )}

        <ul className={styles.features}>
          <li>
            <strong>Veilig importeren</strong>
            <span>Producten komen altijd als concept binnen. Duplicaten worden herkend en overgeslagen.</span>
          </li>
          <li>
            <strong>Prijzen die kloppen</strong>
            <span>Kostprijs, btw, transactiekosten en marge — exact berekend, afgerond op ,95 of ,99.</span>
          </li>
          <li>
            <strong>Kwaliteit vooraf</strong>
            <span>Controle op beeldrechten, levertijd, veiligheidsinformatie en ontbrekende gegevens.</span>
          </li>
        </ul>
      </div>
    </main>
  );
}
