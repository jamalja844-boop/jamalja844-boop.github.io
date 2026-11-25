"""Architecturen: Tool-agent (audit/verificatie), Skill-agent (selectie), Orchestrator (configuratie) + geheugen-ACL."""
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

from helpers import ENGINE, ROOT, decision, run_hook

import calc  # noqa: E402
from skills import load_skills, select  # noqa: E402
from validate import validate  # noqa: E402


class ToolAgentTests(unittest.TestCase):
    def test_audit_log_records_and_redacts(self):
        log_dir = Path(os.environ["AGENT_LOG_DIR"])
        run_hook("audit_log.py", {"hook_event_name": "PostToolUse", "tool_name": "Bash", "tool_input": {"command": "echo api_key=supersecret123"}, "tool_response": {"stdout": "ok"}, "agent_type": "tool-runner"})
        run_hook("audit_log.py", {"hook_event_name": "PostToolUseFailure", "tool_name": "Bash", "tool_input": {"command": "false"}, "error": "exit 1"})
        run_hook("audit_log.py", {"hook_event_name": "PostToolUse", "tool_name": "mcp__Semrush__keyword_research", "tool_input": {}})
        actions = (log_dir / "actions.jsonl").read_text()
        self.assertIn("tool-runner", actions)
        self.assertNotIn("supersecret123", actions)
        self.assertIn("exit 1", (log_dir / "errors.jsonl").read_text())
        self.assertIn("Semrush", (log_dir / "costs.jsonl").read_text())

    def test_integration_detection_reads_no_secret_values(self):
        env = {**os.environ, "OPENAI_API_KEY": "sk-testwaarde-mag-niet-zichtbaar-zijn"}
        r = subprocess.run([sys.executable, str(ENGINE / "integrations.py"), "--json"], capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(r.returncode, 0)
        data = json.loads(r.stdout)
        self.assertEqual(data["env_vars_aanwezig"]["OpenAI"], ["OPENAI_API_KEY"])
        self.assertNotIn("sk-testwaarde", r.stdout)
        self.assertTrue(data["cli"]["git"])

    def test_calc_exact(self):
        res = calc.offerte(["Schoonmaak|3|35", "Materiaal|1|0.10"], calc.Decimal(21), calc.Decimal(0))
        self.assertEqual(res["totaal_excl"], "105.10")
        self.assertEqual(res["btw"], "22.07")
        self.assertEqual(res["totaal_incl"], "127.17")


class SkillAgentTests(unittest.TestCase):
    def test_all_project_skills_loadable(self):
        names = {s["name"] for s in load_skills()}
        for required in ("task-routing", "sequential-delivery", "parallel-fanout", "human-approval", "quality-gate", "memory-protocol", "skill-authoring", "seo-audit", "quote-offerte", "finance-calc", "shopify-ops", "customer-reply", "video-script", "social-content-plan", "secure-dev", "integration-check"):
            self.assertIn(required, names)

    def test_automatic_selection(self):
        cases = {
            "Maak een offerte voor 10 uur kantoorschoonmaak": "quote-offerte",
            "Doe een SEO audit van noblenest.nl": "seo-audit",
            "Beantwoord een klacht van een klant": "customer-reply",
            "Schrijf een videoscript voor TikTok": "video-script",
            "Pas de voorraad aan in Shopify": "shopify-ops",
            "Leg dit werkproces vast als nieuwe skill": "skill-authoring",
        }
        for task, skill in cases.items():
            with self.subTest(task=task):
                self.assertEqual(select(task)["gekozen_skills"][0], skill)


class OrchestratorTests(unittest.TestCase):
    def test_configuration_valid(self):
        self.assertEqual(validate(), [])

    def test_settings_preserved_and_hooks_wired(self):
        s = json.loads((ROOT / ".claude" / "settings.json").read_text())
        self.assertTrue(s["enabledPlugins"]["shopify-ai-toolkit@claude-plugins-official"])  # bestaande config behouden
        cmds = json.dumps(s["hooks"])
        for hook in ("hitl_guard.py", "memory_acl.py", "audit_log.py", "route_hint.py"):
            self.assertIn(hook, cmds)

    def test_route_hint_injects_context(self):
        res = run_hook("route_hint.py", {"prompt": "Schrijf 3 Instagram posts voor de lancering van de webshop"})
        ctx = res["hookSpecificOutput"]["additionalContext"]
        self.assertIn("[router]", ctx)
        self.assertIn("social-media", ctx)


class MemoryAclTests(unittest.TestCase):
    def p(self, rel):
        return str(ROOT / rel)

    def test_need_to_know(self):
        cases = [
            ("seo", "Read", "memory/hr/medewerkers.md", "deny"),
            ("hr", "Read", "memory/hr/medewerkers.md", "allow"),
            ("sales", "Read", "memory/finance/tarieven.md", "allow"),
            ("sales", "Write", "memory/finance/tarieven.md", "deny"),
            ("seo", "Read", "memory/company/bedrijfskennis.md", "allow"),
            ("seo", "Write", "memory/company/bedrijfskennis.md", "deny"),
            ("seo", "Write", "memory/knowledge/lessons.md", "allow"),
            ("qa", "Write", "memory/acl.json", "deny"),
            (None, "Read", "memory/hr/medewerkers.md", "allow"),  # hoofdsessie/CEO
        ]
        for agent, tool, path, expected in cases:
            with self.subTest(agent=agent, path=path, tool=tool):
                payload = {"tool_name": tool, "tool_input": {"file_path": self.p(path)}, "cwd": str(ROOT)}
                if agent:
                    payload["agent_type"] = agent
                self.assertEqual(decision(run_hook("memory_acl.py", payload)), expected)

    def test_secrets_blocked_for_everyone(self):
        for path in (".env", ".env.production", "secrets/shopify.txt", "deploy/server.pem"):
            with self.subTest(path=path):
                self.assertEqual(decision(run_hook("memory_acl.py", {"tool_name": "Read", "tool_input": {"file_path": self.p(path)}, "cwd": str(ROOT)})), "deny")
        self.assertEqual(decision(run_hook("memory_acl.py", {"tool_name": "Read", "tool_input": {"file_path": self.p(".env.example")}, "cwd": str(ROOT)})), "allow")

    def test_bash_bypass_blocked(self):
        res = run_hook("memory_acl.py", {"tool_name": "Bash", "tool_input": {"command": "cat memory/hr/salarissen.md"}, "agent_type": "marketing", "cwd": str(ROOT)})
        self.assertEqual(decision(res), "deny")
        res = run_hook("memory_acl.py", {"tool_name": "Bash", "tool_input": {"command": "cat .env"}, "cwd": str(ROOT)})
        self.assertEqual(decision(res), "deny")


if __name__ == "__main__":
    unittest.main()
