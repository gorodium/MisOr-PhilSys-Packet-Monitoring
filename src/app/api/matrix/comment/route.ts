import { NextRequest } from "next/server";
import { handleApiError, ok, fail } from "@/lib/api";
import { getResolvedSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

let cachedMyId: number | null = null;
let lastCacheTime = 0;

async function getMyIdCached(baseUrl: string, apiKey: string) {
  if (cachedMyId && Date.now() - lastCacheTime < 1000 * 60 * 60) {
    return cachedMyId;
  }
  try {
    const res = await fetch(`${baseUrl}/users/current.json`, {
      headers: { "X-Redmine-API-Key": apiKey, "Accept": "application/json" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      cachedMyId = data.user?.id || null;
      lastCacheTime = Date.now();
    }
  } catch (e) {
    // ignore
  }
  return cachedMyId;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { packetId, ticketId, ticketNumber, comment, autoFormatParams } = body as {
      packetId?: string;
      ticketId: string;
      ticketNumber: string;
      comment?: string;
      autoFormatParams?: {
        packetCode: string;
        destFolder: string;
      };
    };

    if (!ticketId || (!comment && !autoFormatParams)) {
      return fail("ticketId and either comment or autoFormatParams are required", 400);
    }

    const settings = await getResolvedSettings();
    const matrixBaseUrl = settings.matrixBaseUrl;
    
    // API key is secret, so it's not in ResolvedSettings
    const stored = await import("@/lib/settings").then(m => m.getStoredSettings());
    const matrixApiKey = stored.get("matrixApiKey")?.value || process.env.MATRIX_API_KEY || "";

    let finalComment = comment || "";
    if (autoFormatParams) {
      let tmpl = settings.backendRestorationCommentTemplate;
      tmpl = tmpl.replace(/\{\{packetCode\}\}/g, autoFormatParams.packetCode);
      tmpl = tmpl.replace(/\{\{destFolder\}\}/g, autoFormatParams.destFolder);
      finalComment = tmpl;
    }

    if (!matrixBaseUrl || !matrixApiKey) {
      return fail("Matrix API is not configured.", 500);
    }

    const baseUrl = matrixBaseUrl.replace(/\/$/, "");

    // 1. Get current user ID
    const myId = await getMyIdCached(baseUrl, matrixApiKey);

    // 2. Fetch issue to find the correct assignee
    let targetAssigneeId: number | undefined;
    try {
      const issueRes = await fetch(`${baseUrl}/issues/${ticketId}.json?include=journals`, {
        headers: { "X-Redmine-API-Key": matrixApiKey, "Accept": "application/json" },
        cache: "no-store"
      });
      if (issueRes.ok) {
        const issueData = await issueRes.json();
        const journals = issueData.issue.journals || [];
        // Find the last journal entry made by someone other than me
        for (let i = journals.length - 1; i >= 0; i--) {
          const jUser = journals[i].user?.id;
          if (jUser && jUser !== myId) {
            targetAssigneeId = jUser;
            break;
          }
        }
        // Fallback to author if no one else commented
        if (!targetAssigneeId && issueData.issue.author?.id !== myId) {
          targetAssigneeId = issueData.issue.author?.id;
        }
      }
    } catch (e) {
      // ignore
    }

    // 3. Post comment and reassign
    const payload: any = { notes: finalComment };
    if (targetAssigneeId) {
      payload.assigned_to_id = targetAssigneeId;
    }

    const url = `${baseUrl}/issues/${ticketId}.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Redmine-API-Key": matrixApiKey,
      },
      body: JSON.stringify({ issue: payload }),
    });

    if (!res.ok) {
      const text = await res.text();
      return fail(`Matrix comment failed (${res.status}): ${text.slice(0, 200)}`, 502);
    }

    if (packetId) {
      // If we are commenting Unrecoverable, add it to tags immediately to avoid waiting for sync
      const isUnrecoverable = finalComment.toLowerCase().includes("unrecoverable") || finalComment.toLowerCase().includes("re-registration");
      
      const existingPacket = await prisma.packet.findUnique({
        where: { id: packetId },
        select: { matrixTags: true }
      });
      
      let newTags = existingPacket?.matrixTags || [];
      if (isUnrecoverable && !newTags.includes("unrecoverable")) {
        newTags = [...newTags, "unrecoverable"];
      }

      await prisma.packet.update({
        where: { id: packetId },
        data: { 
          restorationCommented: true,
          latestMatrixReply: finalComment,
          matrixTags: newTags
        }
      });
    }

    return ok({ posted: true, ticketNumber });
  } catch (error) {
    return handleApiError(error);
  }
}
