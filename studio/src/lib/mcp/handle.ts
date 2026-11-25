import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyToken } from "../server/tokens";
import { buildMcpServer } from "./server";

/** Stateless Streamable HTTP MCP endpoint: one server + transport per request. */
export async function handleMcp(req: Request, token: string | null): Promise<Response> {
  const owner = await verifyToken(token);
  if (!owner) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: create a token in the studio under Claude & Codex" }, id: null }), {
      status: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="ai-video-ads-studio"' },
    });
  }
  const server = buildMcpServer(owner);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // stateless: release after the response is produced
    setTimeout(() => void server.close().catch(() => {}), 0);
  }
}

export const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;
