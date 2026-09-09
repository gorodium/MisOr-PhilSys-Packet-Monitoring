import { MatchType, Packet, PacketSyncStatus, RunStatus } from "@prisma/client";
import { serializeJson } from "@/lib/api";
import { createMatrixAdapter } from "@/lib/matrix/adapter";
import { MatrixTicketRecord, RelevantReply } from "@/lib/matrix/types";
import { normalizePacketCode, extractLikelyPacketCodes } from "@/lib/packet-normalizer";
import { prisma } from "@/lib/prisma";
import { writePacketUpdatesToSheet } from "@/lib/google-sheets";

type TicketMatch = {
  ticket: MatrixTicketRecord;
  matchedText: string;
  matchType: MatchType;
  relevantReplies: RelevantReply[];
};


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
  // Search all statuses (not just open) so we find the latest ticket even if older ones exist
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

  // If multiple matches, prefer the latest OPEN ticket over closed ones
  if (matches.length > 1) {
    const closedKeywords = ["closed", "resolved", "rejected", "done"];
    const openMatches = matches.filter(m => {
      const status = (m.ticket.status ?? "").toLowerCase();
      return !closedKeywords.some(k => status.includes(k));
    });
    if (openMatches.length === 1) {
      return openMatches; // Resolved to a single open ticket
    }
    // If still multiple, sort by updatedAtMatrix descending and return all
    matches.sort((a, b) =>
      (b.ticket.updatedAtMatrix?.getTime() ?? 0) - (a.ticket.updatedAtMatrix?.getTime() ?? 0)
    );
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
  const startedAt = new Date();
  const log = await prisma.syncLog.create({
    data: {
      syncType: "MATRIX_TO_DB_SYNC",
      status: RunStatus.RUNNING,
      message: "Fetching Matrix tickets to populate packets.",
      startedAt
    }
  });

  try {
    const adapter = await createMatrixAdapter();
    const allTickets = await adapter.fetchTickets();
    const results = [];
    const errors = [];

    // Clear matches to recreate them
    await prisma.ticketPacketMatch.deleteMany();

    for (const ticket of allTickets) {
      try {
        const detailedTicket = (await adapter.fetchTicketDetails(ticket.matrixTicketId)) ?? ticket;
        const dbTicket = await upsertMatrixTicket(detailedTicket);

        // 1. Extract packets from the main ticket text
        const titleBodyCodes = adapter.extractPacketCodesFromTicket(detailedTicket);
        for (const code of titleBodyCodes) {
          await upsertPacketFromMatrix(code, dbTicket, detailedTicket, null, MatchType.BODY);
        }

        // 2. Extract packets from all replies
        const replies = await adapter.fetchTicketReplies(detailedTicket.matrixTicketId);
        for (const reply of replies) {
          const replyCodes = extractLikelyPacketCodes(reply.body || "");
          for (const code of replyCodes) {
            await upsertPacketFromMatrix(code, dbTicket, detailedTicket, reply, MatchType.REPLY);
          }
        }

        results.push({ ticketId: ticket.matrixTicketId });
      } catch (err) {
        errors.push({ ticketId: ticket.matrixTicketId, message: err instanceof Error ? err.message : String(err) });
      }
    }

    const finalStatus = errors.length === 0 ? RunStatus.SUCCESS : results.length > 0 ? RunStatus.PARTIAL : RunStatus.ERROR;
    
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: finalStatus,
        message: `Synced packets from ${allTickets.length} Matrix tickets.`,
        details: { ticketsScanned: allTickets.length, results, errors },
        finishedAt: new Date()
      }
    });

    return { matrixResult: { results, errors } };
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: RunStatus.ERROR,
        message: error instanceof Error ? error.message : "Sync failed.",
        finishedAt: new Date()
      }
    });
    throw error;
  }
}

async function upsertPacketFromMatrix(
  packetCode: string,
  dbTicket: any,
  matrixTicket: MatrixTicketRecord,
  reply: any,
  matchType: MatchType
) {
  const normalized = normalizePacketCode(packetCode);
  
  // Upsert the packet itself
  const packet = await prisma.packet.upsert({
    where: { normalizedPacketCode: normalized },
    create: {
      packetCode: packetCode,
      normalizedPacketCode: normalized,
      issueCategory: matrixTicket.title.substring(0, 50),
      sourceSheetRowNumber: 0,
      sourceSheetRawData: {},
      syncStatus: PacketSyncStatus.FILED,
      filedInTicket: true,
      ticketNumber: matrixTicket.ticketNumber,
      ticketId: matrixTicket.matrixTicketId,
      matrixTicketDbId: dbTicket.id,
      latestMatrixReply: reply?.body || null,
      latestMatrixReplyAuthor: reply?.author || null,
      latestMatrixReplyDate: reply?.createdAt || null,
      lastCheckedAt: new Date()
    },
    update: {
      syncStatus: PacketSyncStatus.FILED,
      filedInTicket: true,
      ticketNumber: matrixTicket.ticketNumber,
      ticketId: matrixTicket.matrixTicketId,
      matrixTicketDbId: dbTicket.id,
      latestMatrixReply: reply?.body || null,
      latestMatrixReplyAuthor: reply?.author || null,
      latestMatrixReplyDate: reply?.createdAt || null,
      lastCheckedAt: new Date()
    }
  });

  // Create the match record
  await prisma.ticketPacketMatch.create({
    data: {
      packetId: packet.id,
      matrixTicketId: dbTicket.id,
      matchType: matchType,
      confidenceScore: 1,
      matchedText: (reply?.body || matrixTicket.body || "").slice(0, 4000)
    }
  });

  return packet;
}

