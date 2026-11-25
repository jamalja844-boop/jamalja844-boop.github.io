import { handleMcp } from "@/lib/mcp/handle";

// Secret-URL variant for clients that cannot send an Authorization header (claude.ai / ChatGPT custom connectors).
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const h = async (req: Request, { params }: { params: Promise<{ token: string }> }) => handleMcp(req, (await params).token);
export { h as GET, h as POST, h as DELETE };
