"""Architectuur: Human-in-the-loop-agent (hook hitl_guard.py)."""
import unittest

from helpers import decision, run_hook

ASK = [
    ("Bash", {"command": "git push origin main"}),
    ("Bash", {"command": "git push --force origin feature"}),
    ("Bash", {"command": "rm -rf memory/projects"}),
    ("Bash", {"command": "curl -X POST https://api.example.com/send -d '{}'"}),
    ("Bash", {"command": "npm publish"}),
    ("Bash", {"command": "echo hoi | mail -s test klant@example.com"}),
    ("Bash", {"command": "sendmail klant@example.com < brief.txt"}),
    ("Bash", {"command": "git reset --hard HEAD~3"}),
    ("mcp__Metricool_Social_Media_Management__createScheduledPost", {"text": "hoi"}),
    ("mcp__Shopify__graphql_mutation", {"query": "mutation { productDelete }"}),
    ("mcp__Shopify__set-inventory", {}),
    ("mcp__Google_Drive__share_file", {"fileId": "x"}),
    ("mcp__Google_Drive__trash_file", {"fileId": "x"}),
    ("mcp__kloudboard__publish_post", {}),
    ("mcp__kloudboard__buy_credits", {}),
    ("mcp__Openart__openart_generate_image", {}),
    ("mcp__Supermetrics_Marketing_Analytics__manage_campaign", {}),
    ("mcp__github__merge_pull_request", {}),
    ("mcp__github__push_files", {"branch": "main"}),
    ("mcp__ElevenLabs__agents_outbound_call", {}),
]
ALLOW = [
    ("Bash", {"command": "git push -u origin claude/feature-branch"}),
    ("Bash", {"command": "ls -la && git status"}),
    ("Bash", {"command": "python3 workflows/engine/router.py 'test'"}),
    ("Bash", {"command": "curl -s https://example.com"}),
    ("mcp__Shopify__graphql_query", {"query": "{ shop { name } }"}),
    ("mcp__Metricool_Social_Media_Management__getBrandSettings", {}),
    ("mcp__Google_Drive__get_file_permissions", {}),
    ("mcp__github__push_files", {"branch": "claude/feature"}),
    ("Read", {"file_path": "index.html"}),
    # regressie: false positive gemeld door CEO in live-test L7
    ("Bash", {"command": "python3 workflows/engine/router.py \"Een klant vraagt per mail waarom het duur is\""}),
]


class HitlTests(unittest.TestCase):
    def test_requires_approval(self):
        for tool, ti in ASK:
            with self.subTest(tool=tool, ti=ti):
                res = run_hook("hitl_guard.py", {"tool_name": tool, "tool_input": ti, "agent_type": "social-media", "session_id": "t"})
                self.assertEqual(decision(res), "ask")
                self.assertIn("TOESTEMMING VEREIST", res["hookSpecificOutput"]["permissionDecisionReason"])

    def test_safe_actions_pass(self):
        for tool, ti in ALLOW:
            with self.subTest(tool=tool, ti=ti):
                self.assertEqual(decision(run_hook("hitl_guard.py", {"tool_name": tool, "tool_input": ti})), "allow")

    def test_garbage_input_never_blocks(self):
        import subprocess, sys
        from helpers import HOOKS
        r = subprocess.run([sys.executable, str(HOOKS / "hitl_guard.py")], input="geen json", capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
