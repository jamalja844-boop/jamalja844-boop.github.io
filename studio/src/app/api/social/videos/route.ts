import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { listVideos } from "@/lib/social/posts";
export const GET = handler(async () => listVideos((await requireUser()).id, 200));
