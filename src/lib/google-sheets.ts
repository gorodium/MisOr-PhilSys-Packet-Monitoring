import { google } from "googleapis";
import { PacketSyncStatus, RunStatus } from "@prisma/client";
import { demoSheetRows } from "@/lib/demo-data";
import { getRuntimeConfig, readEnv } from "@/lib/env";
import { getResolvedSettings, ResolvedSettings } from "@/lib/settings";
import { normalizePacketCode, extractLikelyPacketCodes } from "@/lib/packet-normalizer";
import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/retry";

type SheetRawRow = Record<string, string>;

type ParsedSheetRow = {
  rowNumber: number;
  packetCode: string;
  normalizedPacketCode: string;
  issueCategory: string | null;
  rawData: SheetRawRow;
};

type SheetReadResult = {
  rows: ParsedSheetRow[];
  headers: string[];
};

function quoteSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function headerIndex(headers: string[], target: string) {
  const normalizedTarget = target.trim().toLowerCase();
  return headers.findIndex((header) => header.trim().toLowerCase() === normalizedTarget);
}

function findPacketColumn(headers: string[], configuredName: string) {
  const configured = headerIndex(headers, configuredName);
  if (configured >= 0) {
    return configured;
  }

  return headers.findIndex((header) => /packet/i.test(header));
}

function valuesToRows(values: string[][], settings: ResolvedSettings): SheetReadResult {
  const headers = (values[0] ?? []).map((value) => String(value ?? "").trim());
  const packetColumnIndex = findPacketColumn(headers, settings.packetColumnName);

  if (packetColumnIndex < 0) {
    throw new Error(`Packet column was not found. Configure ${settings.packetColumnName} or add a packet header.`);
  }

  const categoryColumnIndex = headerIndex(headers, settings.issueCategoryColumnName);
  const rows: ParsedSheetRow[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const packetCode = String(row[packetColumnIndex] ?? "").trim();
    
    const extractedCodes = extractLikelyPacketCodes(packetCode);
    
    // Fallback: if we couldn't extract 29-digit codes, just normalize whatever is there.
    // This ensures we still capture invalid TRNs so they can be flagged.
    const codesToProcess = extractedCodes.length > 0 ? extractedCodes : [normalizePacketCode(packetCode)];

    for (const normalizedPacketCode of codesToProcess) {
      if (!normalizedPacketCode) continue;

      const rawData = headers.reduce<SheetRawRow>((accumulator, header, cellIndex) => {
        if (header) {
          accumulator[header] = String(row[cellIndex] ?? "");
        }
        return accumulator;
      }, {});

      rows.push({
        rowNumber: index + 1,
        packetCode: extractedCodes.length > 0 ? normalizedPacketCode : packetCode, // if multiple, store the exact TRN as the packetCode
        normalizedPacketCode,
        issueCategory: categoryColumnIndex >= 0 ? String(row[categoryColumnIndex] ?? "").trim() || null : null,
        rawData
      });
    }
  }

  return { rows, headers };
}

async function getSheetsClient() {
  const email = readEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = readEnv("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  const apiKey = readEnv("GOOGLE_API_KEY");

  if (email && privateKey) {
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    return google.sheets({ version: "v4", auth });
  }

  if (apiKey) {
    return google.sheets({ version: "v4", auth: apiKey });
  }

  throw new Error("Google credentials are not configured. Provide Service Account or API Key.");
}

async function readRowsFromGoogle(settings: ResolvedSettings) {
  if (!settings.googleSpreadsheetId) {
    throw new Error("Google Spreadsheet ID is not configured.");
  }

  const sheets = await getSheetsClient();
  const range = `${quoteSheetName(settings.googleSheetName)}!A:ZZ`;

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: settings.googleSpreadsheetId,
      range,
      valueRenderOption: "FORMATTED_VALUE"
    })
  );

  return valuesToRows((response.data.values as string[][] | undefined) ?? [], settings);
}

function readRowsFromDemo(settings: ResolvedSettings) {
  const headers = Array.from(new Set(demoSheetRows.flatMap((row) => Object.keys(row))));
  const values = [
    headers,
    ...demoSheetRows.map((row) => headers.map((header) => String(row[header as keyof typeof row] ?? "")))
  ];

  return valuesToRows(values, settings);
}

export async function readSheetPackets(settings?: ResolvedSettings) {
  const resolvedSettings = settings ?? (await getResolvedSettings());
  const runtime = getRuntimeConfig();

  if (runtime.demoMode || !resolvedSettings.googleSpreadsheetId) {
    return readRowsFromDemo(resolvedSettings);
  }

  return readRowsFromGoogle(resolvedSettings);
}

export async function syncGoogleSheetPackets() {
  const startedAt = new Date();
  const log = await prisma.syncLog.create({
    data: {
      syncType: "GOOGLE_SHEET_READ",
      status: RunStatus.RUNNING,
      message: "Reading packets from Google Sheets.",
      startedAt
    }
  });

  try {
    const result = await readSheetPackets();

    for (const row of result.rows) {
      await prisma.packet.upsert({
        where: { normalizedPacketCode: row.normalizedPacketCode },
        create: {
          packetCode: row.packetCode,
          normalizedPacketCode: row.normalizedPacketCode,
          issueCategory: row.issueCategory,
          sourceSheetRowNumber: row.rowNumber,
          sourceSheetRawData: row.rawData,
          syncStatus: PacketSyncStatus.PENDING
        },
        update: {
          packetCode: row.packetCode,
          issueCategory: row.issueCategory,
          sourceSheetRowNumber: row.rowNumber,
          sourceSheetRawData: row.rawData,
          updatedAt: new Date()
        }
      });
    }

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: RunStatus.SUCCESS,
        message: `Synced ${result.rows.length} packet rows from Google Sheets.`,
        details: { rowCount: result.rows.length, headers: result.headers },
        finishedAt: new Date()
      }
    });

    return {
      packetsSynced: result.rows.length,
      headers: result.headers
    };
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: RunStatus.ERROR,
        message: error instanceof Error ? error.message : "Google Sheets sync failed.",
        details: { message: error instanceof Error ? error.message : "Google Sheets sync failed." },
        finishedAt: new Date()
      }
    });
    throw error;
  }
}

function columnToA1(index: number) {
  let value = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }

  return value;
}

export async function writePacketUpdatesToSheet(packetIds?: string[]) {
  const settings = await getResolvedSettings();
  const runtime = getRuntimeConfig();
  const startedAt = new Date();
  const log = await prisma.syncLog.create({
    data: {
      syncType: "GOOGLE_SHEET_WRITEBACK",
      status: RunStatus.RUNNING,
      message: "Writing packet status updates to Google Sheets.",
      startedAt
    }
  });

  try {
    const packets = await prisma.packet.findMany({
      where: packetIds?.length ? { id: { in: packetIds } } : undefined,
      orderBy: { sourceSheetRowNumber: "asc" }
    });

    if (runtime.demoMode || !settings.googleSpreadsheetId) {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: RunStatus.SKIPPED,
          message: "Google Sheets writeback skipped in demo mode or without a spreadsheet ID.",
          details: { packetsConsidered: packets.length },
          finishedAt: new Date()
        }
      });
      return { updatedCells: 0, skipped: true };
    }

    const email = readEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = readEnv("GOOGLE_PRIVATE_KEY");
    if (!email || !privateKey) {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: RunStatus.SKIPPED,
          message: "Google Sheets writeback skipped because Service Account credentials are not configured. API Key is for read-only access.",
          details: { packetsConsidered: packets.length },
          finishedAt: new Date()
        }
      });
      return { updatedCells: 0, skipped: true };
    }

    const sheetRead = await readRowsFromGoogle(settings);
    const outputColumns = [
      settings.outputFiledStatusColumn,
      settings.outputTicketNumberColumn,
      settings.outputRemarksColumn,
      settings.outputLastUpdatedColumn
    ];
    const missingColumns = outputColumns.filter((column) => headerIndex(sheetRead.headers, column) < 0);

    if (missingColumns.length > 0) {
      throw new Error(`Configured output columns are missing: ${missingColumns.join(", ")}`);
    }

    const data = packets.flatMap((packet) => {
      const valuesByColumn = new Map([
        [settings.outputFiledStatusColumn, packet.syncStatus.replaceAll("_", " ")],
        [settings.outputTicketNumberColumn, packet.ticketNumber ?? ""],
        [settings.outputRemarksColumn, packet.latestMatrixReply ?? ""],
        [settings.outputLastUpdatedColumn, new Date().toISOString()]
      ]);

      return outputColumns.map((column) => {
        const columnIndex = headerIndex(sheetRead.headers, column);
        return {
          range: `${quoteSheetName(settings.googleSheetName)}!${columnToA1(columnIndex)}${packet.sourceSheetRowNumber}`,
          values: [[valuesByColumn.get(column) ?? ""]]
        };
      });
    });

    const sheets = await getSheetsClient();
    await withRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: settings.googleSpreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data
        }
      })
    );

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: RunStatus.SUCCESS,
        message: `Wrote ${data.length} configured output cells to Google Sheets.`,
        details: { packetsUpdated: packets.length, cellsUpdated: data.length },
        finishedAt: new Date()
      }
    });

    return { updatedCells: data.length, skipped: false };
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: RunStatus.ERROR,
        message: error instanceof Error ? error.message : "Google Sheets writeback failed.",
        details: { message: error instanceof Error ? error.message : "Google Sheets writeback failed." },
        finishedAt: new Date()
      }
    });
    throw error;
  }
}
