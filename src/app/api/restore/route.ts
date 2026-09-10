import { NextRequest } from "next/server";
import { handleApiError, ok, fail } from "@/lib/api";
import { getStoredSettings } from "@/lib/settings";
import { searchPacketOnNas, copyPacketToDestination, PacketSearchResult } from "@/lib/nas-client";
import { NAS_SEARCH_HOSTS, NAS_DESTINATION_HOST, NAS_DESTINATION_ROOT } from "@/lib/nas-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Give up to 5 minutes — NAS searches can be slow
export const maxDuration = 300;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ──────────────────────────────────────────────────────────────────────
// Matrix comment helper
// ──────────────────────────────────────────────────────────────────────

async function postMatrixComment(baseUrl: string, apiKey: string, ticketId: string, message: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/issues/${ticketId}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/json",
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

// ──────────────────────────────────────────────────────────────────────
// POST /api/restore
// Body: { trn, ticketId, ticketNumber, proLptFolder? }
// ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { packetId, trn, ticketId, ticketNumber, proLptFolder } = body as {
      packetId?: string;
      trn: string;
      ticketId: string;
      ticketNumber: string;
      proLptFolder?: string;
    };

    if (!trn || !ticketId || !ticketNumber) {
      return fail("trn, ticketId, and ticketNumber are required", 400);
    }

    // ── Load settings ──
    const stored = await getStoredSettings();
    const nasUsername = stored.get("nasUsername")?.value || process.env.NAS_USERNAME || "";
    const nas1Password = stored.get("nas1Password")?.value || process.env.NAS1_PASSWORD || "";
    const nas2Password = stored.get("nas2Password")?.value || process.env.NAS2_PASSWORD || "";
    const matrixBaseUrl = stored.get("matrixBaseUrl")?.value || process.env.MATRIX_BASE_URL || "";
    const matrixApiKey = stored.get("matrixApiKey")?.value || process.env.MATRIX_API_KEY || "";

    if (!nasUsername || !nas1Password || !nas2Password) {
      return fail(
        "NAS credentials not configured. Please set NAS Username, NAS 1 Password, and NAS 2 Password in Settings.",
        500
      );
    }

    const steps: string[] = [];

    const log = (msg: string) => steps.push(msg);

    // ── Phase 1: Search ──
    log(`🔍 Searching for packet: ${trn}`);
    if (proLptFolder) log(`   PRO-LPT folder: ${proLptFolder}`);

    let foundResult: PacketSearchResult | null = null;
    let foundOnHost = null;

    for (const host of NAS_SEARCH_HOSTS) {
      log(`\nTrying ${host.name} (${host.host})...`);

      try {
        // Use "/Misamis Oriental" as search root — NAS folder structure starts there
        const searchRoot = "/Misamis Oriental";
        const passwordToUse = host.name.includes("NAS2") ? nas2Password : nas1Password;

        const results = await searchPacketOnNas(
          host,
          nasUsername,
          passwordToUse,
          trn,
          proLptFolder,
          searchRoot,
          (msg) => log(`   ${msg}`)
        );

        if (results.length > 0) {
          foundResult = results[0];
          foundOnHost = host;
          log(`✅ Found: ${foundResult.remotePath} (${(foundResult.size / 1024).toFixed(1)} KB)`);
          break;
        } else {
          log(`❌ Not found on ${host.name}`);
        }
      } catch (err: any) {
        log(`⚠️ Error on ${host.name}: ${err?.message ?? String(err)}`);
      }
    }

    if (!foundResult || !foundOnHost) {
      return ok({ success: false, steps, error: "Packet not found on any NAS." });
    }

    // ── Phase 2: Copy to destination ──
    const destFolder = `${NAS_DESTINATION_ROOT}/${ticketNumber}`;
    log(`\n📤 Uploading to ${NAS_DESTINATION_HOST.name}...`);
    log(`   Destination folder: ${destFolder}`);

    let uploadedPath = "";
    let alreadyUploaded = false;
    try {
      const result = await copyPacketToDestination(
        foundOnHost,
        NAS_DESTINATION_HOST,
        nasUsername,
        foundOnHost.name.includes("NAS2") ? nas2Password : nas1Password,
        nas1Password,
        foundResult.remotePath,
        destFolder,
        foundResult.packetName,
        (msg) => log(`   ${msg}`)
      );
      uploadedPath = result.path;
      alreadyUploaded = result.alreadyUploaded;
    } catch (err: any) {
      log(`❌ Upload failed: ${err?.message ?? String(err)}`);
      return ok({ success: false, steps, error: `Upload failed: ${err?.message}` });
    }

    // ── Phase 3: Update local DB (we shouldn't post Matrix comment automatically, user clicks Post Comment) ──
    // The user explicitly clicks the "Post Comment" button from the UI.
    
    if (packetId) {
      await prisma.packet.update({
        where: { id: packetId },
        data: { restorationUploaded: true },
      });
    }

    return ok({
      success: true,
      steps,
      foundPath: foundResult.remotePath,
      uploadedTo: uploadedPath,
      destFolder,
      packetName: foundResult.packetName,
      alreadyUploaded,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
