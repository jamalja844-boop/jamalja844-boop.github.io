/**
 * Seed (idempotent):
 *  - beheerder uit SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (of bestaande eerste gebruiker)
 *  - workspace "Clean Schoonmaakbedrijf B.V." met 16 AI-medewerkers, bedrijfsgegevens en offerteworkflow
 *  - lege workspace "NobleNest" (volledig gescheiden)
 *  - DEMO-omgeving met duidelijk gemarkeerde voorbeeldgegevens (alleen als ENABLE_DEMO_PROVIDER=true)
 * Gebruik: npm run db:seed
 */
import { loadEnvFile } from "./load-env";

loadEnvFile();

async function main() {
  const { withSystem, closeDb, json } = await import("@/lib/db");
  const { hashPassword, passwordProblems } = await import("@/lib/auth/password");
  const { createOrganization } = await import("@/lib/orgs/service");
  const { installCleanPack } = await import("@/lib/templates/clean");
  const { demoProviderEnabled } = await import("@/lib/env");
  const { catalogEntry } = await import("@/lib/ai/catalog");

  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  let userId: string;

  const [existing] = await withSystem((tx) =>
    email ? tx<{ id: string }[]>`select id from users where email = ${email}` : tx<{ id: string }[]>`select id from users order by created_at limit 1`,
  );
  if (existing) {
    userId = existing.id;
    console.log("✓ Beheerder bestaat al");
  } else {
    if (!email || !password) {
      console.error("Stel SEED_ADMIN_EMAIL en SEED_ADMIN_PASSWORD in (of maak eerst een account via /setup).");
      process.exit(1);
    }
    const problems = passwordProblems(password, email);
    if (problems.length) {
      console.error(`SEED_ADMIN_PASSWORD moet ${problems.join(", ")}.`);
      process.exit(1);
    }
    const hash = await hashPassword(password);
    const [u] = await withSystem((tx) => tx<{ id: string }[]>`
      insert into users (email, name, password_hash, is_platform_admin) values (${email}, ${process.env.SEED_ADMIN_NAME ?? "Beheerder"}, ${hash}, true) returning id`);
    userId = u.id;
    console.log(`✓ Beheerder aangemaakt: ${email}`);
  }

  async function ensureOrg(slug: string, name: string, description: string, isDemo = false) {
    const [org] = await withSystem((tx) => tx<{ id: string }[]>`select id from organizations where slug = ${slug}`);
    if (org) {
      await withSystem((tx) => tx`insert into memberships (org_id, user_id, role) values (${org.id}, ${userId}, 'owner') on conflict do nothing`);
      return { id: org.id, created: false };
    }
    const id = await withSystem((tx) => createOrganization(tx, { slug, name, description, ownerUserId: userId, isDemo }));
    console.log(`✓ Workspace aangemaakt: ${name} (/w/${slug})`);
    return { id, created: true };
  }

  // Standaardmodel voor de agents: Claude als er een sleutel is, anders demo (indien actief), anders Claude (verbinding later instellen).
  const model = process.env.ANTHROPIC_API_KEY
    ? { provider: "anthropic", modelId: "claude-opus-5-5" }
    : demoProviderEnabled()
      ? { provider: "demo", modelId: "demo-simulator" }
      : { provider: "anthropic", modelId: "claude-opus-5-5" };
  if (!catalogEntry(model.provider, model.modelId)) throw new Error("Onbekend standaardmodel");

  const clean = await ensureOrg(
    "clean",
    "Clean Schoonmaakbedrijf B.V.",
    "Clean Schoonmaakbedrijf B.V., Laan van Vollenhove 2081, 3706 GS Zeist · 030-2378037 · info@cleanschoonmaakbedrijf.nl · www.cleanschoonmaakbedrijf.nl",
  );
  const r = await installCleanPack({ orgId: clean.id, userId }, model, { companyFacts: true });
  console.log(`✓ Clean-agents: ${r.created} nieuw (${r.total} in pakket), model ${model.provider}/${model.modelId}`);

  await ensureOrg("noblenest", "NobleNest", "Afzonderlijke workspace voor NobleNest. Gegevens en rechten zijn volledig gescheiden van andere bedrijven.");

  if (demoProviderEnabled()) {
    const demo = await ensureOrg("demo", "Demo-omgeving", "Duidelijk herkenbare demo-omgeving met voorbeeldgegevens.", true);
    await installCleanPack({ orgId: demo.id, userId }, { provider: "demo", modelId: "demo-simulator" });
    if (demo.created) {
      await withSystem(async (tx) => {
        const samples = [
          ["klanten", "Voorbeeldklant Kantoor A (DEMO)", { plaats: "Voorbeeldstad", m2: 400, frequentie: "2x per week" }],
          ["klanten", "Voorbeeldklant Praktijk B (DEMO)", { plaats: "Voorbeeldstad", m2: 150, frequentie: "wekelijks" }],
          ["leads", "Voorbeeldlead School C (DEMO)", { bron: "website (voorbeeld)", m2: 1200 }],
          ["klachten", "Voorbeeldklacht sanitair (DEMO)", { ernst: "middel", object: "Kantoor A (voorbeeld)" }],
        ] as const;
        for (const [collection, title, data] of samples) {
          await tx`insert into records (org_id, collection, title, data, is_demo, created_by_type) values (${demo.id}, ${collection}, ${title}, ${json(tx, data)}, true, 'system')`;
        }
      });
      console.log("✓ Demo-voorbeeldgegevens toegevoegd (gemarkeerd als DEMO)");
    }
  }
  await closeDb();
  console.log("Klaar.");
}

main().catch((e) => {
  console.error("✗ Seed mislukt:", e);
  process.exit(1);
});
