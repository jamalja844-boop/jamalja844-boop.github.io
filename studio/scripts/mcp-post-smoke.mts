import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const [base, token] = process.argv.slice(2);
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0].text;
  console.log(`\n▶ ${name}${r.isError ? " (error)" : ""}\n${text.slice(0, 900)}`);
  return r.isError ? null : JSON.parse(text);
};
const vids = await call("list_videos", { limit: 5 });
await call("list_social_accounts");
const now = await call("schedule_post", { video_id: vids[0].video_id, platforms: ["youtube"], scheduled_at: "now" });
const plan = await call("auto_schedule", { video_ids: vids.map((v: { video_id: string }) => v.video_id), platforms: ["youtube"], start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), times: ["12:00", "19:30"], timezone: "Europe/Amsterdam" });
await call("cancel_post", { post_id: plan[1].post_id });
await new Promise((r) => setTimeout(r, 25000));
await call("list_posts", {});
process.exit(0);
