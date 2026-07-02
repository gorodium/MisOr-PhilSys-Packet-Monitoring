import { MatchType, Packet, PacketSyncStatus, Prisma, RunStatus } from "@prisma/client";
import { createMatrixAdapter } from "@/lib/matrix/adapter";
import { MatrixTicketRecord, RelevantReply } from "@/lib/matrix/types";
import { normalizePacketCode } from "@/lib/packet-normalizer";
import { prisma } from "@/lib/prisma";
import { writePacketUpdatesToSheet } from "@/lib/google-sheets";

type TicketMatch = {
  ticket: MatrixTicketRecord;
  matchedText: string;
  matchType: MatchType;
  relevantReplies: RelevantReply[];
};

function serializeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function ticketContainsPacket(ticket: MatrixTicketRecord, packetCode: string) {
  const normalizedPacketCode = normalizePacketCode(packetCode);
  return ticket.title.toUpperCase().includes(normalizedPacketCode) || ticket.body.toUpperCase().includes(normalizedPacketCode);
}

function latestReply(replies: RelevantReply[]) {
  return replies
    .slice()
    .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))[0];
}

async function upsertMatrixTicket(ticket: MatrixTicketRecord) {
  return prisma.matrixTicket.upsert({
    where: { matrixTicketId: ticket.matrixTicketId },
    create: {
      matrixTicketId: ticket.matrixTicketId,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      body: ticket.body,
      status: ticket.status,
      author: ticket.author,
      createdAtMatrix: ticket.createdAtMatrix,
      updatedAtMatrix: ticket.updatedAtMatrix,
      rawData: serializeJson(ticket.rawData)
    },
    update: {
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      body: ticket.body,
      status: ticket.status,
      author: ticket.author,
      createdAtMatrix: ticket.createdAtMatrix,
      updatedAtMatrix: ticket.updatedAtMatrix,
      rawData: serializeJson(ticket.rawData)
    }
  });
}

async function findMatchesForPacket(packet: Packet) {
  const adapter = await createMatrixAdapter();
  const searchedTickets = await adapter.searchTicketsByPacket(packet.normalizedPacketCode);
  const allTickets = searchedTickets.length > 0 ? searchedTickets : await adapter.fetchTickets();
  const matches: TicketMatch[] = [];

  for (const candidate of allTickets) {
    const detailedTicket = (await adapter.fetchTicketDetails(candidate.matrixTicketId)) ?? candidate;
    const extractedCodes = adapter.extractPacketCodesFromTicket(detailedTicket);
    const relevantReplies = await adapter.extractRelevantRepliesForPacket(
      detailedTicket,
      packet.normalizedPacketCode
    );
    const packetInTicket = extractedCodes.includes(packet.normalizedPacketCode);
    const packetInReply = relevantReplies.length > 0;

    if (!packetInTicket && !packetInReply && !ticketContainsPacket(detailedTicket, packet.normalizedPacketCode)) {
      continue;
    }

    matches.push({
      ticket: detailedTicket,
      matchedText: packetInTicket ? `${detailedTicket.title}\n${detailedTicket.body}` : relevantReplies[0]?.matchedText ?? "",
      matchType: packetInTicket ? MatchType.BODY : MatchType.REPLY,
      relevantReplies
    });
  }

  return matches;
}

async function applyPacketMatches(packet: Packet, matches: TicketMatch[]) {
  await prisma.ticketPacketMatch.deleteMany({
    where: { packetId: packet.id }
  });

  if (matches.length === 0) {
    await prisma.packet.update({
      where: { id: packet.id },
      data: {
        filedInTicket: false,
        ticketNumber: null,
        ticketId: null,
        matrixTicketDbId: null,
        latestMatrixReply: null,
        latestMatrixReplyAuthor: null,
        latestMatrixReplyDate: null,
        syncStatus: PacketSyncStatus.NOT_FILED,
        lastCheckedAt: new Date()
      }
    });
    return { status: PacketSyncStatus.NOT_FILED, ticketCount: 0 };
  }

  const dbTickets = await Promise.all(matches.map((match) => upsertMatrixTicket(match.ticket)));

  await prisma.ticketPacketMatch.createMany({
    data: matches.map((match, index) => ({
      packetId: packet.id,
      matrixTicketId: dbTickets[index].id,
      matchType: match.matchType,
      confidenceScore: matches.length === 1 ? 1 : 0.65,
      matchedText: match.matchedText.slice(0, 4000)
    }))
  });

  if (matches.length > 1) {
    await prisma.packet.update({
      where: { id: packet.id },
      data: {
        filedInTicket: false,
        ticketNumber: matches.map((match) => match.ticket.ticketNumber).join(", "),
        ticketId: null,
        matrixTicketDbId: null,
        latestMatrixReply: null,
        latestMatrixReplyAuthor: null,
        latestMatrixReplyDate: null,
        syncStatus: PacketSyncStatus.NEEDS_REVIEW,
        lastCheckedAt: new Date()
      }
    });
    return { status: PacketSyncStatus.NEEDS_REVIEW, ticketCount: matches.length };
  }

  const match = matches[0];
  const reply = latestReply(match.relevantReplies);
  await prisma.packet.update({
    where: { id: packet.id },
    data: {
      filedInTicket: true,
      ticketNumber: match.ticket.ticketNumber,
      ticketId: match.ticket.matrixTicketId,
      matrixTicketDbId: dbTickets[0].id,
      latestMatrixReply: reply?.body ?? null,
      latestMatrixReplyAuthor: reply?.author ?? null,
      latestMatrixReplyDate: reply?.createdAt ?? null,
      syncStatus: PacketSyncStatus.FILED,
      lastCheckedAt: new Date()
    }
  });

  return { status: PacketSyncStatus.FILED, ticketCount: 1 };
}

export async function syncMatrixMatches(input: { packetIds?: string[]; writeBack?: boolean } = {}) {
  const startedAt = new Date();
  const log = await prisma.syncLog.create({
    data: {
      syncType: "MATRIX_MATCH",
      status: RunStatus.RUNNING,
      message: "Matching packets against Matrix tickets.",
      startedAt
    }
  });

  const packets = await prisma.packet.findMany({
    where: input.packetIds?.length ? { id: { in: input.packetIds } } : undefined,
    orderBy: { sourceSheetRowNumber: "asc" }
  });
  const results: Array<{ packetId: string; status: PacketSyncStatus; ticketCount: number }> = [];
  const errors: Array<{ packetId: string; message: string }> = [];

  for (const packet of packets) {
    try {
      const matches = await findMatchesForPacket(packet);
      results.push({
        packetId: packet.id,
        ...(await applyPacketMatches(packet, matches))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Matrix matching failed.";
      errors.push({ packetId: packet.id, message });
      await prisma.packet.update({
        where: { id: packet.id },
        data: {
          syncStatus: PacketSyncStatus.ERROR,
          lastCheckedAt: new Date()
        }
      });
    }
  }

  const status = errors.length === 0 ? RunStatus.SUCCESS : results.length > 0 ? RunStatus.PARTIAL : RunStatus.ERROR;

  await prisma.syncLog.update({
    where: { id: log.id },
    data: {
      status,
      message: `Matched ${results.length} packets against Matrix tickets.`,
      details: { results, errors },
      finishedAt: new Date()
    }
  });

  if (input.writeBack) {
    await writePacketUpdatesToSheet(input.packetIds);
  }

  return {
    packetsScanned: packets.length,
    results,
    errors
  };
}

export async function runFullSync() {
  const { syncGoogleSheetPackets } = await import("@/lib/google-sheets");
  const sheetResult = await syncGoogleSheetPackets();
  const matrixResult = await syncMatrixMatches({ writeBack: true });

  return {
    sheetResult,
    matrixResult
  };
}

