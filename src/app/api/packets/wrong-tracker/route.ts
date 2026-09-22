import { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const packets = await prisma.packet.findMany({
      where: {
        OR: [
          { latestMatrixReply: { contains: "kindly file", mode: "insensitive" } },
          { latestMatrixReply: { contains: "correct tracker", mode: "insensitive" } },
          { latestMatrixReply: { contains: "file to correct", mode: "insensitive" } },
          { latestMatrixReply: { contains: "wrong tracker", mode: "insensitive" } },
        ]
      },
      include: { matrixTicket: true },
      orderBy: { latestMatrixReplyDate: "desc" }
    });

    const enrichedPackets = await Promise.all(packets.map(async (p) => {
      const originalReq = await prisma.matrixFilingRequest.findFirst({
        where: { trn: p.normalizedPacketCode },
        orderBy: { createdAt: 'desc' }
      });
      return {
        ...p,
        originalRemarks: originalReq?.remarks || null
      };
    }));

    return ok({ packets: enrichedPackets });
  } catch (error) {
    return handleApiError(error);
  }
}
