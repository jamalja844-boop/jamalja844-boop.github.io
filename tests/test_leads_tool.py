import sys, pathlib, subprocess, tempfile, unittest
HERE = pathlib.Path(__file__).parent; sys.path.insert(0, str(HERE/"tools"))
import leads_tool as lt
class T(unittest.TestCase):
    def setUp(self): self.rows = lt.read(HERE/"fixtures/leads_sample.csv")
    def test_dedupe(self): self.assertEqual(len(lt.dedupe(self.rows)), 2)
    def test_validate_flags(self):
        p = "\n".join(lt.validate(self.rows))
        self.assertIn("persoonsgebonden", p); self.assertIn("JJJJ-MM-DD", p); self.assertIn("mobiel", p)
        self.assertNotIn("r2:", p)
    def test_cli_dedupe(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d)/"o.csv"
            r = subprocess.run([sys.executable, HERE/"tools/leads_tool.py", "dedupe", HERE/"fixtures/leads_sample.csv", "-o", out], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0); self.assertEqual(len(lt.read(out)), 2)
class Config(unittest.TestCase):
    def test_validator(self):
        r = subprocess.run([sys.executable, HERE/"validate_agents.py"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)
if __name__ == "__main__": unittest.main(verbosity=2)
