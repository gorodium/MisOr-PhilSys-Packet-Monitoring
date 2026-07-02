import { Packet } from "@prisma/client";

const placeholderPattern = /{{\s*(packetCode|issueCategory|date|sourceSheetName|sourceRowNumber)\s*}}/g;

export function renderTicketBodyTemplate(input: {
  template: string;
  packet: Pick<Packet, "normalizedPacketCode" | "issueCategory" | "sourceSheetRowNumber">;
  sourceSheetName: string;
  date?: Date;
}) {
  const values: Record<string, string> = {
    packetCode: input.packet.normalizedPacketCode,
    issueCategory: input.packet.issueCategory ?? "Unspecified",
    date: (input.date ?? new Date()).toISOString().slice(0, 10),
    sourceSheetName: input.sourceSheetName,
    sourceRowNumber: String(input.packet.sourceSheetRowNumber)
  };

  return input.template.replace(placeholderPattern, (_, key: string) => values[key] ?? "");
}
