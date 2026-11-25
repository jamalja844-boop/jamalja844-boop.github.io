"""Architectuur: Parallel-agent (taskboard.py)."""
import concurrent.futures
import unittest
import uuid

import helpers  # noqa: F401
import taskboard as tb


class ParallelTests(unittest.TestCase):
    def setUp(self):
        self.board = "par-" + uuid.uuid4().hex[:6]
        tb.plan(self.board, [
            {"id": "seo", "titel": "SEO meta", "agent": "seo", "paden": ["out/seo.md"]},
            {"id": "social", "titel": "Instagram posts", "agent": "social-media", "paden": ["out/social/"]},
            {"id": "qa", "titel": "Consistentiecheck", "agent": "qa", "paden": [], "afhankelijk_van": ["seo", "social"]},
        ])

    def test_duplicate_and_path_conflicts(self):
        with self.assertRaises(tb.Conflict):
            tb.plan(self.board, [{"id": "seo2", "titel": "seo  META", "agent": "seo"}])
        with self.assertRaises(tb.Conflict):
            tb.plan(self.board, [{"id": "x", "titel": "Ander werk", "agent": "video", "paden": ["out/social/post1.md"]}])

    def test_concurrent_claims_only_one_wins(self):
        def claim(agent):
            try:
                tb.claim(self.board, "seo", agent)
                return agent
            except tb.Conflict:
                return None
        with concurrent.futures.ThreadPoolExecutor(8) as ex:
            winners = [w for w in ex.map(claim, [f"agent{i}" for i in range(8)]) if w]
        self.assertEqual(len(winners), 1)

    def test_dependencies_fanin_and_merge(self):
        with self.assertRaises(tb.Conflict):
            tb.claim(self.board, "qa", "qa")  # wacht op seo+social
        with concurrent.futures.ThreadPoolExecutor(2) as ex:
            list(ex.map(lambda t: (tb.claim(self.board, t, t), tb.done(self.board, t, f"resultaat {t}")), ["seo", "social"]))
        with self.assertRaises(tb.Conflict):
            tb.merge(self.board)  # qa nog open
        tb.claim(self.board, "qa", "qa")
        tb.done(self.board, "qa", "consistent")
        res = tb.merge(self.board)
        merged = (tb.board_dir(self.board) / "merged.md").read_text()
        self.assertEqual(res["taken"], 3)
        for part in ("resultaat seo", "resultaat social", "consistent"):
            self.assertIn(part, merged)

    def test_fail_releases_task(self):
        tb.claim(self.board, "seo", "seo")
        tb.fail(self.board, "seo", "API-fout")
        self.assertEqual(tb.claim(self.board, "seo", "seo")["claimed"], "seo")


if __name__ == "__main__":
    unittest.main()
