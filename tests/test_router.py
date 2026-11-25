"""Architectuur: Router-agent."""
import unittest

import helpers  # noqa: F401
from router import route

CASES = [
    # opdracht, primaire agent, verwachte samenwerking, toestemming-ids
    ("Doe zoekwoordonderzoek en verbeter de SEO van de homepage", "seo", None, set()),
    ("Schrijf 5 Instagram posts en plan ze in via Metricool", "social-media", None, {"publish"}),
    ("Bouw een nieuwe landingspagina met contactformulier en API", "frontend", "sequential", set()),
    ("Maak een offerte voor 10 uur schoonmaak en verstuur de mail naar de klant", "sales", None, {"email"}),
    ("Verwijder alle oude producten uit de Shopify webshop", "e-commerce", None, {"delete"}),
    ("Bereken de BTW en marge op onze nieuwe factuur", "finance", None, set()),
    ("Schrijf een vacature voor een nieuwe medewerker schoonmaak", "hr", None, set()),
    ("Maak een videoscript voor een TikTok filmpje", "video", None, set()),
    ("Beantwoord deze klacht van een klant over een te late levering", "customer-service", None, set()),
    ("Controleer de website op beveiliging en AVG privacy", "security", None, set()),
    ("Verhoog het advertentiebudget van de Google Ads campagne", "marketing", None, {"ad_budget"}),
    ("Maak een wireframe in Figma voor de nieuwe app", "ui-ux", None, set()),
    ("Automatiseer de koppeling tussen Shopify en Google Drive", "automation", None, set()),
    ("Maak een screenshot van de website met de browser", "browser", None, set()),
]


class RouterTests(unittest.TestCase):
    def test_cases(self):
        for task, agent, mode, approvals in CASES:
            with self.subTest(task=task):
                r = route(task)
                self.assertEqual(r["primaire_agent"], agent, r["match"])
                if mode:
                    self.assertEqual(r["samenwerking"], mode)
                self.assertEqual({a["id"] for a in r["toestemming"]}, approvals)

    def test_unknown_goes_to_ceo(self):
        r = route("Hoe gaat het vandaag?")
        self.assertEqual(r["primaire_agent"], "ceo")
        self.assertIn("laag", r["zekerheid"])

    def test_multi_department_parallel(self):
        r = route("Lanceer de campagne: SEO zoekwoorden, Instagram posts en een videoscript")
        self.assertEqual(r["samenwerking"], "parallel")
        self.assertTrue(r["orchestrator_nodig"])
        self.assertGreaterEqual(len(r["afdelingen"]), 1)
        self.assertGreaterEqual(len(r["ondersteunende_agents"]), 2)

    def test_output_contract(self):
        r = route("Maak een offerte")
        for key in ("afdeling", "primaire_agent", "ondersteunende_agents", "samenwerking", "skills", "tools", "toestemming_nodig"):
            self.assertIn(key, r)
        self.assertIn("quality-gate", r["skills"])
        self.assertTrue(r["tools"], "tools uit agent-frontmatter verwacht")


if __name__ == "__main__":
    unittest.main()
