import { requireUser } from "@/lib/server/auth";
import { handler } from "@/lib/server/http";
import { routes } from "@/lib/social/publishers";
export const GET = handler(async () => routes((await requireUser()).id));
