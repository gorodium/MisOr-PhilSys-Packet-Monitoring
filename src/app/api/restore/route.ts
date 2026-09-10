import { NextRequest, NextResponse } from "next/server";
import { handleApiError, ok, fail } from "@/lib/api";
import { getStoredSettings } from "@/lib/settings";
import { searchPacketOnNas, copyPacketToDestination } from "@/lib/nas-client";
import { NAS_SEARCH_HOSTS, NAS_DESTINATION_HOST, NAS_DESTINATION_ROOT } from "@/lib/nas-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Long-running — give it up to 5 minutes
export const maxDuration = 300;

function buildTicketFolder(ticketNumber: string) {
  return `${NAS_DESTINATION_ROOT}/${ticketNumber}`;
}

async function postMatrixComment(baseUrl: string, apiKey: string, ticketId: string, message: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/issues/${ticketId}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Redmine-API-Key": apiKey,
    },
    body: JSON.stringify({ issue: { notes: message } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Matrix comment failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trn, ticketId, ticketNumber } = body as { trn: string; ticketId: string; ticketNumber: string };

    if (!trn || !ticketId || !ticketNumber) {
      return fail("trn, ticketId, and ticketNumber are required", 400);
    }

    const stored = await getStoredSettings();
    const nasUsername = stored.get("nasUsername")?.value || process.env.NAS_USERNAME || "";
    const nasPassword = stored.get("nasPassword")?.value || process.env.NAS_PASSWORD || "";
    const matrixBaseUrl = stored.get("matrixBaseUrl")?.value || process.env.MATRIX_BASE_URL || "";
    const matrixApiKey = stored.get("matrixApiKey")?.value || process.env.MATRIX_API_KEY || "";

    if (!nasUsername || !nasPassword) {
      return fail("NAS credentials not configured. Please set NAS Username and NAS Password in Settings.", 500);
    }
    if (!matrixBaseUrl || !matrixApiKey) {
      return fail("Matrix API not configured.", 500);
    }

    const steps: string[] = [];

    // Step 1: Search NASes
    steps.push(`Searching for packet: ${trn}`);
    let foundResult = null;
    let foundOnHost = null;

    for (const host of NAS_SEARCH_HOSTS) {
      steps.push(`Trying ${host.name} (${host.host})...`);
      try {
        const results = await searchPacketOnNas(host, nasUsername, nasPassword, trn);
        if (results.length > 0) {
          foundResult = results[0];
          foundOnHost = host;
          steps.push(`✅ Found on ${host.name}: ${foundResult.remotePath}`);
          break;
        } else {
          steps.push(`❌ Not found on ${host.name}`);
        }
      } catch (err: any) {
        steps.push(`⚠️ Error connecting to ${host.name}: ${err?.message ?? String(err)}`);
      }
    }

    if (!foundResult || !foundOnHost) {
      return ok({ success: false, steps, error: "Packet not found on any NAS." });
    }

    // Step 2: Copy to destination
    const destFolder = buildTicketFolder(ticketNumber);
    steps.push(`Copying to ${destFolder} on ${NAS_DESTINATION_HOST.name}...`);

    let copiedPath = "";
    try {
      copiedPath = await copyPacketToDestination(
        foundOnHost,
        NAS_DESTINATION_HOST,
        nasUsername,
        nasPassword,
        foundResult.remotePath,
        destFolder,
        foundResult.packetName
      );
      steps.push(`✅ Uploaded: ${copiedPath}`);
    } catch (err: any) {
      steps.push(`❌ Upload failed: ${err?.message ?? String(err)}`);
      return ok({ success: false, steps, error: `Upload failed: ${err?.message}` });
    }

    // Step 3: Post Matrix comment
    steps.push(`Posting comment to Matrix ticket #${ticketNumber}...`);
    const commentBody = `Packet has been uploaded to\n\n${destFolder}/${foundResult.packetName}\n\n${trn}\n\nPlease proceed.`;
    try {
      await postMatrixComment(matrixBaseUrl, matrixApiKey, ticketId, commentBody);
      steps.push(`✅ Comment posted to ticket #${ticketNumber}`);
    } catch (err: any) {
      steps.push(`⚠️ Comment failed: ${err?.message ?? String(err)}`);
    }

    return ok({
      success: true,
      steps,
      foundPath: foundResult.remotePath,
      uploadedTo: copiedPath,
      destFolder,
      packetName: foundResult.packetName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
