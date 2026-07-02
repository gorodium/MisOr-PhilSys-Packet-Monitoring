import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function dashboardEventPayload() {
  const [latestSync, latestAutomation] = await Promise.all([
    prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.automationRun.findFirst({ orderBy: { startedAt: "desc" } })
  ]);

  return {
    latestSync,
    latestAutomation,
    sentAt: new Date().toISOString()
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const payload = await dashboardEventPayload();
          controller.enqueue(encoder.encode(`event: sync\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Event stream failed." })}\n\n`
            )
          );
        }
      };

      await send();
      interval = setInterval(send, 10000);
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

