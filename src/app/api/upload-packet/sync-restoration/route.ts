import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { machineFolderForPacket, machineProvinceForPacket } from "@/lib/packet-normalizer";

export const dynamic = "force-dynamic";

export interface SyncedRestorationPacket {
  id: string;
  packetCode: string;
  requiredInitialTrn: string | null;
  matchedTrn: string;
  ticketId: string;
  ticketNumber: string;
  proLptFolder: string;
  province: string;
  restorationUploaded: boolean;
  restorationCommented: boolean;
  wasNotFound: boolean;
}

export async function syncTrnsWithBackendRestoration(inputTrns?: string[]): Promise<{
  syncedCount: number;
  matchedPackets: SyncedRestorationPacket[];
}> {
  let rawTrns = inputTrns && inputTrns.length > 0 ? inputTrns : [];
  if (rawTrns.length === 0) {
    const history = await prisma.uploadedPacket.findMany({
      select: { trn: true },
      orderBy: { createdAt: "desc" }
    });
    rawTrns = history.map((h) => h.trn);
  }

  const trnSet = new Set(
    rawTrns
      .map((t) => (t || "").replace(/\D/g, ""))
      .filter((t) => t.length >= 20)
  );

  if (trnSet.size === 0) {
    return { syncedCount: 0, matchedPackets: [] };
  }

  const candidatePackets = await prisma.packet.findMany({
    where: {
      ticketId: { not: null },
      ticketNumber: { not: null },
      OR: [
        { matrixTags: { has: "for_backend_restoration" } },
        { latestMatrixReply: { contains: "backend restoration", mode: "insensitive" } },
        { latestMatrixReply: { contains: "initial registration", mode: "insensitive" } },
        { latestMatrixReply: { contains: "locate the physical packet", mode: "insensitive" } },
        { restorationUploaded: true },
        { restorationCommented: true },
        { restorationNotFound: true }
      ]
    }
  });

  const matchedPackets: SyncedRestorationPacket[] = [];
  let syncedCount = 0;

  for (const p of candidatePackets) {
    if (!p.ticketId || !p.ticketNumber) continue;

    const replyLower = (p.latestMatrixReply || "").toLowerCase();
    const isAvailable =
      p.matrixTags?.includes("available_to_download") ||
      replyLower.includes("available to download") ||
      replyLower.includes("available for download") ||
      replyLower.includes("ready to download") ||
      replyLower.includes("ready for download");
    if (isAvailable) continue;

    const codeDigits = (p.normalizedPacketCode || p.packetCode || "").replace(/\D/g, "");
    const matchInit = (p.latestMatrixReply || "").match(/(?:Initial|NEW)\s+REGISTRATION:\s*(\d{29})/i);
    const resolvedInitTrn = (
      p.requiredInitialTrn ||
      (matchInit && matchInit[1] && matchInit[1] !== p.packetCode ? matchInit[1] : "")
    ).replace(/\D/g, "");

    const matchesCode = Boolean(codeDigits && trnSet.has(codeDigits));
    const matchesInit = Boolean(resolvedInitTrn && trnSet.has(resolvedInitTrn));

    if (!matchesCode && !matchesInit) continue;

    const matchedTrn = matchesInit ? resolvedInitTrn : codeDigits;
    const targetTrnForFolder = resolvedInitTrn || p.normalizedPacketCode || p.packetCode;

    const needsReset = p.restorationNotFound || (!p.requiredInitialTrn && resolvedInitTrn && resolvedInitTrn !== codeDigits);
    if (needsReset && (!p.restorationUploaded || !p.restorationCommented)) {
      await prisma.packet.update({
        where: { id: p.id },
        data: {
          restorationNotFound: false,
          ...(resolvedInitTrn && !p.requiredInitialTrn && resolvedInitTrn !== codeDigits
            ? { requiredInitialTrn: resolvedInitTrn }
            : {})
        }
      });
      syncedCount++;
    } else if (!p.restorationUploaded || !p.restorationCommented) {
      syncedCount++;
    }

    matchedPackets.push({
      id: p.id,
      packetCode: p.packetCode,
      requiredInitialTrn: resolvedInitTrn && resolvedInitTrn !== codeDigits ? resolvedInitTrn : p.requiredInitialTrn,
      matchedTrn,
      ticketId: p.ticketId,
      ticketNumber: p.ticketNumber,
      proLptFolder: machineFolderForPacket(targetTrnForFolder),
      province: machineProvinceForPacket(targetTrnForFolder),
      restorationUploaded: p.restorationUploaded,
      restorationCommented: p.restorationCommented,
      wasNotFound: p.restorationNotFound
    });
  }

  return { syncedCount, matchedPackets };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const trns = Array.isArray(body?.trns) ? body.trns : undefined;
    const result = await syncTrnsWithBackendRestoration(trns);
    return NextResponse.json({
      success: true,
      syncedCount: result.syncedCount,
      matchedPackets: result.matchedPackets
    });
  } catch (error: any) {
    console.error("Sync restoration error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to sync with Backend Restoration" },
      { status: 500 }
    );
  }
}
