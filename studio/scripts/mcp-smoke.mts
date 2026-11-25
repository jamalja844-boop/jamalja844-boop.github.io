// End-to-end check of the MCP server with the official MCP client (as Claude / Codex use it).
// Usage: tsx scripts/mcp-smoke.mts <base-url> <token> <shop-url>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [base, token, shop] = process.argv.slice(2);
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0].text;
  console.log(`\n▶ ${name}${r.isError ? " (error)" : ""}\n${text.slice(0, 700)}`);
  return { error: !!r.isError, data: r.isError ? null : JSON.parse(text) };
};
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const scan = await call("scan_shop", { url: shop, limit: 10 });
const job = await call("create_videos", { shop_url: shop, product_ids: scan.data.products.slice(0, 2).map((p: { id: string }) => p.id), seconds: 6, formats: ["9:16"], language: "nl", rights_confirmed: true });
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await client.callTool({ name: "get_video_job", arguments: { job_id: job.data.job_id } });
  const d = JSON.parse((s.content as { text: string }[])[0].text);
  process.stdout.write(`\r  videos ${d.videos_ready}/${d.videos_total} (${d.status})   `);
  if (d.status === "done" && d.videos_total > 0 && d.videos_ready === d.videos_total) break;
}
const vids = await call("list_videos", { limit: 5 });
const vid = vids.data[0].video_id;
await call("suggest_caption", { video_id: vid, platform: "tiktok", language: "nl" });
await call("list_social_accounts");
await call("schedule_post", { video_id: vid, platforms: ["tiktok"], scheduled_at: "now" });
console.log("\n(connect a platform for the next step)");
process.exit(0);
