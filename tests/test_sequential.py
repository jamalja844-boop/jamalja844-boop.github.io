"""Architectuur: Sequential-agent (pipeline.py)."""
import unittest
import uuid

import helpers  # noqa: F401
import pipeline


class SequentialTests(unittest.TestCase):
    def setUp(self):
        self.id = "seq-" + uuid.uuid4().hex[:6]
        pipeline.start("Bouw een slugify-functie", self.id)

    def _complete(self, stage, text=None):
        return pipeline.complete(self.id, stage, text or f"Resultaat van {stage}")

    def test_order_enforced(self):
        with self.assertRaises(SystemExit):
            self._complete("ontwerp")  # analyse is nog niet klaar

    def test_context_handoff(self):
        self._complete("analyse", "Acceptatiecriterium: slugify('Hé Daar') == 'he-daar'")
        self._complete("onderzoek", "Gebruik unicodedata.normalize")
        nxt = pipeline.next_stage(self.id)
        self.assertEqual(nxt["fase"], "ontwerp")
        self.assertEqual(nxt["agent"], "ui-ux")
        self.assertIn("slugify('Hé Daar')", nxt["context"])
        self.assertIn("unicodedata.normalize", nxt["context"])

    def test_quality_gate_blocks_and_reopens(self):
        for s in ("analyse", "onderzoek", "ontwerp", "ontwikkeling", "testen"):
            self._complete(s)
        res = self._complete("kwaliteitscontrole", "Fout in randgeval.\nVERDICT: AFGEKEURD")
        self.assertEqual(res["volgende"], "ontwikkeling")  # herstel-lus
        with self.assertRaises(SystemExit):
            self._complete("oplevering")
        for s in ("ontwikkeling", "testen"):
            self._complete(s, f"{s} hersteld")
        self._complete("kwaliteitscontrole", "Alles gecontroleerd.\nVERDICT: GOEDGEKEURD")
        res = self._complete("oplevering", "Opgeleverd")
        self.assertIsNone(res["volgende"])
        self.assertTrue(pipeline.next_stage(self.id)["klaar"])

    def test_skip_rules(self):
        tid = self.id + "-skip"
        t = pipeline.start("Kleine fix", tid, ["onderzoek", "ontwerp"])
        self.assertEqual([s["status"] for s in t["stages"]][1:3], ["overgeslagen", "overgeslagen"])
        with self.assertRaises(SystemExit):
            pipeline.start("x", tid + "2", ["kwaliteitscontrole"])

    def test_secrets_redacted_in_history(self):
        self._complete("analyse", "token=ghp_abcdefghijklmnopqrstuvwxyz1234567890")
        out = (pipeline.task_dir(self.id) / "01-analyse.md").read_text()
        self.assertNotIn("ghp_abcdefghijklmnop", out)


if __name__ == "__main__":
    unittest.main()
