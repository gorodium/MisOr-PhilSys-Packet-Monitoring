import { Packet, PacketSyncStatus, RunStatus } from "@prisma/client";
import { serializeJson } from "@/lib/api";
import { buildTicketTitle, createMatrixAdapter } from "@/lib/matrix/adapter";
import { prisma } from "@/lib/prisma";
import { getResolvedSettings } from "@/lib/settings";
import { renderTicketBodyTemplate } from "@/lib/template";
import { syncMatrixMatches } from "@/lib/matching";


async function getTicketCandidates(packetIds?: string[]) {
  return prisma.packet.findMany({
    where: {
      ...(packetIds?.length ? { id: { in: packetIds } } : {}),
      syncStatus: { in: [PacketSyncStatus.NOT_FILED, PacketSyncStatus.PENDING, PacketSyncStatus.ERROR] }
    },
    orderBy: { sourceSheetRowNumber: "asc" }
  });
}

function renderTicketPreview(packet: Packet, settings: Awaited<ReturnType<typeof getResolvedSettings>>) {
  return {
    packetId: packet.id,
    packetCode: packet.normalizedPacketCode,
    issueCategory: packet.issueCategory,
    sourceSheetRowNumber: packet.sourceSheetRowNumber,
    title: buildTicketTitle(packet),
    body: renderTicketBodyTemplate({
      template: settings.ticketBodyTemplate,
      packet,
      sourceSheetName: settings.googleSheetName
    })
  };
}

export async function dryRunAutomation(input: { packetIds?: string[]; recheck?: boolean } = {}) {
  if (input.recheck) {
    await syncMatrixMatches({ packetIds: input.packetIds });
  }

  const settings = await getResolvedSettings();
  const packets = await getTicketCandidates(input.packetIds);

  return {
    candidates: packets.map((packet) => renderTicketPreview(packet, settings))
  };
}

export async function createTicketsForPackets(input: { packetIds: string[]; confirmed: boolean }) {
  if (!input.confirmed) {
    throw new Error("Ticket creation requires explicit confirmation.");
  }

  const startedAt = new Date();
  const run = await prisma.automationRun.create({
    data: {
      runType: "MANUAL_CREATE_TICKETS",
      status: RunStatus.RUNNING,
      startedAt
    }
  });

  const errors: Array<{ packetId: string; message: string }> = [];
  let ticketsCreated = 0;

  try {
    await syncMatrixMatches({ packetIds: input.packetIds });
    const settings = await getResolvedSettings();
    const adapter = await createMatrixAdapter();
    const candidates = await getTicketCandidates(input.packetIds);

    for (const packet of candidates) {
      try {
        const preview = renderTicketPreview(packet, settings);
        const ticket = await adapter.createTicketForPacket({
          packet,
          title: preview.title,
          body: preview.body
        });
        const matrixTicket = await prisma.matrixTicket.upsert({
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

        await prisma.ticketPacketMatch.deleteMany({ where: { packetId: packet.id } });
        await prisma.ticketPacketMatch.create({
          data: {
            packetId: packet.id,
            matrixTicketId: matrixTicket.id,
            matchType: "MANUAL",
            confidenceScore: 1,
            matchedText: preview.body.slice(0, 4000)
          }
        });
        await prisma.packet.update({
          where: { id: packet.id },
          data: {
            filedInTicket: true,
            ticketNumber: ticket.ticketNumber,
            ticketId: ticket.matrixTicketId,
            matrixTicketDbId: matrixTicket.id,
            syncStatus: PacketSyncStatus.FILED,
            lastCheckedAt: new Date()
          }
        });
        ticketsCreated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ticket creation failed.";
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

    const status = errors.length === 0 ? RunStatus.SUCCESS : ticketsCreated > 0 ? RunStatus.PARTIAL : RunStatus.ERROR;
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status,
        packetsScanned: candidates.length,
        ticketsCreated,
        errors: errors.length ? errors : undefined,
        finishedAt: new Date()
      }
    });

    return {
      packetsScanned: candidates.length,
      ticketsCreated,
      errors
    };
  } catch (error) {
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: RunStatus.ERROR,
        errors: [{ message: error instanceof Error ? error.message : "Automation run failed." }],
        finishedAt: new Date()
      }
    });
    throw error;
  }
}

export async function runAutomation(input: { mode: "manual" | "auto" }) {
  const settings = await getResolvedSettings();

  if (input.mode === "auto" && !settings.autoTicketCreationEnabled) {
    const run = await prisma.automationRun.create({
      data: {
        runType: "AUTO_MODE",
        status: RunStatus.SKIPPED,
        errors: [{ message: "Auto ticket creation is disabled." }],
        finishedAt: new Date()
      }
    });
    return { skipped: true, runId: run.id };
  }

  const dryRun = await dryRunAutomation({ recheck: true });
  if (dryRun.candidates.length === 0) {
    const run = await prisma.automationRun.create({
      data: {
        runType: input.mode === "auto" ? "AUTO_MODE" : "MANUAL_RUN",
        status: RunStatus.SUCCESS,
        packetsScanned: 0,
        ticketsCreated: 0,
        finishedAt: new Date()
      }
    });
    return { skipped: false, runId: run.id, packetsScanned: 0, ticketsCreated: 0, errors: [] };
  }

  return createTicketsForPackets({
    packetIds: dryRun.candidates.map((candidate) => candidate.packetId),
    confirmed: true
  });
}

