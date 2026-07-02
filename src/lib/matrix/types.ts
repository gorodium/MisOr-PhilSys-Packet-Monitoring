import { Packet } from "@prisma/client";

export type MatrixReply = {
  id: string;
  body: string;
  author?: string | null;
  createdAt?: Date | null;
  rawData?: unknown;
};

export type MatrixTicketRecord = {
  matrixTicketId: string;
  ticketNumber: string;
  title: string;
  body: string;
  status: string;
  author?: string | null;
  createdAtMatrix?: Date | null;
  updatedAtMatrix?: Date | null;
  rawData?: unknown;
};

export type RelevantReply = MatrixReply & {
  matchedText: string;
};

export type CreateTicketInput = {
  packet: Pick<Packet, "id" | "normalizedPacketCode" | "issueCategory" | "sourceSheetRowNumber">;
  title: string;
  body: string;
};

export type MatrixAdapter = {
  fetchTickets(): Promise<MatrixTicketRecord[]>;
  fetchTicketDetails(ticketId: string): Promise<MatrixTicketRecord | null>;
  searchTicketsByPacket(packetCode: string): Promise<MatrixTicketRecord[]>;
  createTicketForPacket(input: CreateTicketInput): Promise<MatrixTicketRecord>;
  fetchTicketReplies(ticketId: string): Promise<MatrixReply[]>;
  extractPacketCodesFromTicket(ticket: MatrixTicketRecord): string[];
  extractRelevantRepliesForPacket(ticket: MatrixTicketRecord, packetCode: string): Promise<RelevantReply[]>;
};

