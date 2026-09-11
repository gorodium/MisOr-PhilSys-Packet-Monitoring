import { NextRequest } from "next/server";
import { handleApiError, ok, fail } from "@/lib/api";
import { getResolvedSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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
    let myId: number | null = null;
    try {
      const meRes = await fetch(`${baseUrl}/users/current.json`, {
        headers: { "X-Redmine-API-Key": matrixApiKey, "Accept": "application/json" },
        cache: "no-store"
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        myId = meData.user?.id;
      }
    } catch (e) {
      // ignore
    }

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
      await prisma.packet.update({
        where: { id: packetId },
        data: { restorationCommented: true }
      });
    }

    return ok({ posted: true, ticketNumber });
  } catch (error) {
    return handleApiError(error);
  }
}
