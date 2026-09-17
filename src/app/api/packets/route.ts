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


let cachedMyName: string | null = null;
let lastCacheTime = 0;

async function getMyName() {
  if (cachedMyName && Date.now() - lastCacheTime < 1000 * 60 * 60) {
    return cachedMyName;
  }
  try {
    const { getStoredSettings } = await import("@/lib/settings");
    const stored = await getStoredSettings();
    const matrixApiKey = stored.get("matrixApiKey")?.value || process.env.MATRIX_API_KEY;
    const matrixBaseUrl = stored.get("matrixBaseUrl")?.value || process.env.MATRIX_BASE_URL;
    
    if (matrixApiKey && matrixBaseUrl) {
      const res = await fetch(`${matrixBaseUrl.replace(/\/$/, "")}/users/current.json`, {
        headers: { "X-Redmine-API-Key": matrixApiKey, "Accept": "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const first = data.user?.firstname || "";
        const last = data.user?.lastname || "";
        cachedMyName = `${first} ${last}`.trim();
        lastCacheTime = Date.now();
      }
    }
  } catch (e) {
    // ignore
  }
  return cachedMyName || "Joven Dalawangbayan"; // fallback to known name if api fails
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
      cAuthenticationFailed,
      cUnrecoverable
    ] = await Promise.all([
      prisma.packet.findMany({
        where,
        include: { matrixTicket: true },
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
      prisma.packet.count({ where: { latestMatrixReply: { not: null }, latestMatrixReplyAuthor: { not: await getMyName() } } }),
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
      prisma.packet.count({ where: { OR: [{ matrixTags: { has: "authentication_failed" } }, { latestMatrixReply: { contains: "individual authentication", mode: "insensitive" } }, { latestMatrixReply: { contains: "authentication was unsuccessful", mode: "insensitive" } }] } }),
      prisma.packet.count({ where: { OR: [{ matrixTags: { has: "unrecoverable" } }, { latestMatrixReply: { contains: "unrecoverable", mode: "insensitive" } }, { latestMatrixReply: { contains: "re-registration", mode: "insensitive" } }] } })
    ]);

    const totalPages = Math.max(1, Math.ceil(filteredTotal / query.pageSize));

    return ok({
        packets: packets.map((packetObj) => {
          let assignedTo = null;
          let author = null;
          if ((packetObj as any).matrixTicket) {
             author = (packetObj as any).matrixTicket.author;
             try {
               const rd = (packetObj as any).matrixTicket.rawData as any;
               if (rd?.assigned_to?.name) {
                 assignedTo = rd.assigned_to.name;
               }
             } catch (e) {}
          }
          const { matrixTicket, ...rest } = (packetObj as any);
          return {
            ...rest,
            statusLabel: STATUS_LABELS[packetObj.syncStatus as PacketSyncStatus],
            proLptFolder: machineFolderForPacket(packetObj.normalizedPacketCode),
            province: machineProvinceForPacket(packetObj.normalizedPacketCode),
            assignedTo,
            author,
          };
        }),
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
        authenticationFailed: cAuthenticationFailed,
        unrecoverable: cUnrecoverable
      },
      lastSyncedAt: latestSync?.finishedAt ?? null
    });
  } catch (error) {
    return handleApiError(error);
  }
}
