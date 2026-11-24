import { ConfigurationError } from "@/lib/api/errors";
import { ProviderError } from "@/lib/ai/types";

/** NDJSON-stream: één JSON-object per regel. Fouten worden als event verstuurd. */
export function ndjsonResponse(run: (emit: (e: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (e: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        await run(emit);
      } catch (err) {
        if (err instanceof ConfigurationError) emit({ type: "error", error: err.message, setup: err.setup });
        else if (err instanceof ProviderError || err instanceof Error) {
          if (!(err instanceof ProviderError)) console.error("[stream] fout", err);
          emit({ type: "error", error: err instanceof ProviderError || (err as { status?: number }).status ? err.message : "Er ging iets mis op de server" });
        }
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
