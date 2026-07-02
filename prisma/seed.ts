import { PrismaClient, RunStatus } from "@prisma/client";
import { DEFAULT_TICKET_TEMPLATE } from "../src/lib/constants";
import { demoSheetRows } from "../src/lib/demo-data";
import { syncMatrixMatches } from "../src/lib/matching";
import { normalizePacketCode } from "../src/lib/packet-normalizer";

const prisma = new PrismaClient();

const defaultSettings = [
  ["googleSheetName", "Packets"],
  ["packetColumnName", "Packet"],
  ["issueCategoryColumnName", "Issue Category"],
  ["outputFiledStatusColumn", "Filed Status"],
  ["outputTicketNumberColumn", "Ticket Number"],
  ["outputRemarksColumn", "Remarks"],
  ["outputLastUpdatedColumn", "Last Updated"],
  ["matrixMode", "demo"],
  ["syncIntervalSeconds", "300"],
  ["autoTicketCreationEnabled", "false"],
  ["ticketBodyTemplate", DEFAULT_TICKET_TEMPLATE]
];

async function main() {
  for (const [key, value] of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value, isSecret: false },
      update: { value, isSecret: false }
    });
  }

  for (const [index, row] of demoSheetRows.entries()) {
    const packetCode = row.Packet;
    await prisma.packet.upsert({
      where: { normalizedPacketCode: normalizePacketCode(packetCode) },
      create: {
        packetCode,
        normalizedPacketCode: normalizePacketCode(packetCode),
        issueCategory: row["Issue Category"],
        sourceSheetRowNumber: index + 2,
        sourceSheetRawData: row
      },
      update: {
        packetCode,
        issueCategory: row["Issue Category"],
        sourceSheetRowNumber: index + 2,
        sourceSheetRawData: row
      }
    });
  }

  await prisma.syncLog.create({
    data: {
      syncType: "DEMO_SEED",
      status: RunStatus.SUCCESS,
      message: "Demo packets and settings were seeded.",
      finishedAt: new Date()
    }
  });

  await syncMatrixMatches();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

