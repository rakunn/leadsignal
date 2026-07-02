import { hasAnthropicCredentials } from "@/lib/anthropic";
import { runAnalystTurn, type AnalystEvent } from "@/lib/analyst/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const encoder = new TextEncoder();

function sseChunk(event: AnalystEvent): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: Request) {
  if (!hasAnthropicCredentials()) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured on the server — the analyst needs it.",
      },
      { status: 503 },
    );
  }

  let body: { datasetId?: string; conversationId?: string | null; message?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { datasetId, conversationId = null, message } = body;
  if (!datasetId || !message?.trim()) {
    return Response.json(
      { error: "datasetId and message are required" },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      // Keep intermediaries from timing out the stream while tools run.
      const heartbeat = setInterval(
        () => safeEnqueue(encoder.encode(": ping\n\n")),
        15_000,
      );

      runAnalystTurn({
        datasetId,
        conversationId,
        userMessage: message.trim(),
        send: (event) => safeEnqueue(sseChunk(event)),
      })
        .catch((err) => {
          console.error("analyst turn failed", err);
          safeEnqueue(
            sseChunk({
              type: "error",
              message:
                err instanceof Error ? err.message : "The analyst hit an error.",
            }),
          );
        })
        .finally(() => {
          clearInterval(heartbeat);
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
