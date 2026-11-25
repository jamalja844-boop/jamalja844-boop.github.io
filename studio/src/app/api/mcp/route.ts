import { bearer, handleMcp } from "@/lib/mcp/handle";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const h = (req: Request) => handleMcp(req, bearer(req));
export { h as GET, h as POST, h as DELETE };
