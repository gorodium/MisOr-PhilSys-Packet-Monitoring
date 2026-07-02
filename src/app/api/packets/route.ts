import { PacketSyncStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleApiError, ok } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/constants";
import { normalizePacketCode } from "@/lib/packet-normalizer";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const packetQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional()
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

    const [packets, total, filed, notFiled, needsReview, errors, withLatestReply, latestSync] = await Promise.all([
      prisma.packet.findMany({
        where,
        orderBy: [{ issueCategory: "asc" }, { sourceSheetRowNumber: "asc" }],
        take: 500
      }),
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

    return ok({
      packets: packets.map((packet) => ({
        ...packet,
        statusLabel: STATUS_LABELS[packet.syncStatus]
      })),
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

