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

    const where = {
      ...(status ? { syncStatus: status } : {}),
      ...(query.status === "for_backend_restoration"
        ? { latestMatrixReply: { contains: "backend restoration", mode: "insensitive" as const } }
        : {}),
      ...(category ? { issueCategory: category } : {}),
      ...(normalizedSearch
        ? {
            OR: [
              { normalizedPacketCode: { contains: normalizedSearch } },
              { packetCode: { contains: query.search ?? "", mode: "insensitive" as const } }
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
      latestSync
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
      })
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
        errors
      },
      lastSyncedAt: latestSync?.finishedAt ?? null
    });
  } catch (error) {
    return handleApiError(error);
  }
}
