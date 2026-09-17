import { PacketSyncStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleApiError, ok } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/constants";
import { normalizePacketCode, machineFolderForPacket, machineProvinceForPacket } from "@/lib/packet-normalizer";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

const packetQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE)
});

function parseStatus(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return Object.values(PacketSyncStatus).includes(value as PacketSyncStatus)
    ? (value as PacketSyncStatus)
    : undefined;
}

export async function GET(request: NextRequest) {
  const limited = assertRateLimit(request, "packets:list");
  if (limited) {
    return limited;
  }

  try {
    const query = packetQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const status = parseStatus(query.status);
    const normalizedSearch = normalizePacketCode(query.search);
    const category = query.category && query.category !== "All" ? query.category : undefined;
    const rawSearch = query.search ? query.search.replace(/[\s\-_/]/g, "").toUpperCase() : "";

    let matchingTrns: string[] = [];
    if (query.search && query.search.trim().length > 0) {
      const matchingReqs = await prisma.matrixFilingRequest.findMany({
        where: {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" } },
            { middleName: { contains: query.search, mode: "insensitive" } },
            { lastName: { contains: query.search, mode: "insensitive" } },
            { trn: { contains: rawSearch, mode: "insensitive" } }
          ]
        },
        select: { trn: true }
      });
      matchingTrns = matchingReqs.map(r => r.trn);
    }

    const where = {
      ...(status ? { syncStatus: status } : {}),
      ...(query.status === "for_backend_restoration"
        ? {
            OR: [
              { matrixTags: { has: "for_backend_restoration" } },
              { latestMatrixReply: { contains: "backend restoration", mode: "insensitive" as const } },
              { latestMatrixReply: { contains: "initial registration", mode: "insensitive" as const } },
              { restorationUploaded: true },
              { restorationCommented: true }
            ]
          }
        : {}),
      ...(category ? { issueCategory: category } : {}),
      ...(query.search
        ? {
            OR: [
              { normalizedPacketCode: { contains: rawSearch } },
              { packetCode: { contains: query.search, mode: "insensitive" as const } },
              ...(matchingTrns.length > 0 ? [{ packetCode: { in: matchingTrns } }, { normalizedPacketCode: { in: matchingTrns.map(t => normalizePacketCode(t)) } }] : [])
            ]
          }
        : {})
    };

    const skip = (query.page - 1) * query.pageSize;

    const [
      packets,
      filteredTotal,
      total,
      filed,
      notFiled,
      needsReview,
      errors,
      withLatestReply,
      latestSync,
      pendingFilingRequests,
      totalTicketsFiled,
      cForBackendRestoration,
      cStillInProcess,
      cAvailableToDownload,
      cPotentialDuplicate,
      cBiometricsIssue,
      cAuthenticationFailed
    ] = await Promise.all([
      prisma.packet.findMany({
        where,
        orderBy: [{ issueCategory: "asc" }, { sourceSheetRowNumber: "asc" }],
        skip,
        take: query.pageSize
      }),
      prisma.packet.count({ where }),
      prisma.packet.count(),
      prisma.packet.count({ where: { syncStatus: PacketSyncStatus.FILED } }),
      prisma.packet.count({ where: { syncStatus: PacketSyncStatus.NOT_FILED } }),
      prisma.packet.count({ where: { syncStatus: PacketSyncStatus.NEEDS_REVIEW } }),
      prisma.packet.count({ where: { syncStatus: PacketSyncStatus.ERROR } }),
      prisma.packet.count({ where: { latestMatrixReply: { not: null } } }),
      prisma.syncLog.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" }
      }),
      prisma.matrixFilingRequest.count({ where: { status: "PENDING" } }),
      prisma.matrixFilingRequest.count({ where: { status: "FILED" } }),
      prisma.packet.count({ 
        where: { 
          AND: [
            { OR: [{ matrixTags: { has: "for_backend_restoration" } }, { restorationCommented: true }, { restorationUploaded: true }, { latestMatrixReply: { contains: "backend restoration", mode: "insensitive" } }, { latestMatrixReply: { contains: "for backend restoration", mode: "insensitive" } }] },
            { NOT: { OR: [{ matrixTags: { has: "available_to_download" } }, { latestMatrixReply: { contains: "available to download", mode: "insensitive" } }, { latestMatrixReply: { contains: "available for download", mode: "insensitive" } }] } }
          ]
        } 
      }),
      prisma.packet.count({ 
        where: { 
          AND: [
            { OR: [{ matrixTags: { has: "still_in_process" } }, { latestMatrixReply: { contains: "still processing on the backend", mode: "insensitive" } }, { latestMatrixReply: { contains: "still in process", mode: "insensitive" } }, { latestMatrixReply: { contains: "awaiting", mode: "insensitive" } }, { latestMatrixReply: { contains: "still processing", mode: "insensitive" } }] },
            { NOT: { OR: [{ matrixTags: { has: "available_to_download" } }, { latestMatrixReply: { contains: "available to download", mode: "insensitive" } }, { latestMatrixReply: { contains: "available for download", mode: "insensitive" } }] } }
          ]
        } 
      }),
      prisma.packet.count({ where: { OR: [{ matrixTags: { has: "available_to_download" } }, { latestMatrixReply: { contains: "available to download", mode: "insensitive" } }, { latestMatrixReply: { contains: "available for download", mode: "insensitive" } }] } }),
      prisma.packet.count({ where: { OR: [{ matrixTags: { has: "potential_duplicate" } }, { latestMatrixReply: { contains: "potential duplicate", mode: "insensitive" } }, { latestMatrixReply: { contains: "duplicate match", mode: "insensitive" } }, { latestMatrixReply: { contains: "identified with a potential duplicate", mode: "insensitive" } }] } }),
      prisma.packet.count({ where: { OR: [{ matrixTags: { has: "biometrics_issue" } }, { latestMatrixReply: { contains: "biometrics", mode: "insensitive" } }, { latestMatrixReply: { contains: "biometric", mode: "insensitive" } }] } }),
      prisma.packet.count({ where: { OR: [{ matrixTags: { has: "authentication_failed" } }, { latestMatrixReply: { contains: "individual authentication", mode: "insensitive" } }, { latestMatrixReply: { contains: "authentication was unsuccessful", mode: "insensitive" } }] } })
    ]);

    const totalPages = Math.max(1, Math.ceil(filteredTotal / query.pageSize));

    return ok({
        packets: packets.map((packet) => ({
          ...packet,
          statusLabel: STATUS_LABELS[packet.syncStatus],
          proLptFolder: machineFolderForPacket(packet.normalizedPacketCode),
          province: machineProvinceForPacket(packet.normalizedPacketCode),
        })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: filteredTotal,
        totalPages
      },
      counts: {
        total,
        filed,
        notFiled,
        needsReview,
        withLatestReply,
        errors,
        pendingFilingRequests,
        totalTicketsFiled,
        forBackendRestoration: cForBackendRestoration,
        stillInProcess: cStillInProcess,
        availableToDownload: cAvailableToDownload,
        potentialDuplicate: cPotentialDuplicate,
        biometricsIssue: cBiometricsIssue,
        authenticationFailed: cAuthenticationFailed
      },
      lastSyncedAt: latestSync?.finishedAt ?? null
    });
  } catch (error) {
    return handleApiError(error);
  }
}
