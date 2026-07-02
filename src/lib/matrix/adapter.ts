import { Packet } from "@prisma/client";
import { demoReplies, demoTickets } from "@/lib/demo-data";
import { readEnv } from "@/lib/env";
import { extractLikelyPacketCodes, normalizePacketCode } from "@/lib/packet-normalizer";
import { getResolvedSettings } from "@/lib/settings";
import { withRetry } from "@/lib/retry";
import {
  CreateTicketInput,
  MatrixAdapter,
  MatrixReply,
  MatrixTicketRecord,
  RelevantReply
} from "@/lib/matrix/types";

function normalizeDate(value: unknown) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asTicketRecord(raw: Record<string, unknown>): MatrixTicketRecord {
  const matrixTicketId = String(raw.matrixTicketId ?? raw.id ?? raw.ticketId ?? "");
  const ticketNumber = String(raw.ticketNumber ?? raw.number ?? raw.key ?? matrixTicketId);

  if (!matrixTicketId || !ticketNumber) {
    throw new Error("Matrix ticket payload is missing ticket identifiers.");
  }

  return {
    matrixTicketId,
    ticketNumber,
    title: String(raw.title ?? raw.subject ?? ""),
    body: String(raw.body ?? raw.description ?? raw.content ?? ""),
    status: String(raw.status ?? "Unknown"),
    author: raw.author ? String(raw.author) : null,
    createdAtMatrix: normalizeDate(raw.createdAtMatrix ?? raw.createdAt ?? raw.created_at),
    updatedAtMatrix: normalizeDate(raw.updatedAtMatrix ?? raw.updatedAt ?? raw.updated_at),
    rawData: raw
  };
}

function asReplyRecord(raw: Record<string, unknown>): MatrixReply {
  const id = String(raw.id ?? raw.replyId ?? raw.commentId ?? crypto.randomUUID());

  return {
    id,
    body: String(raw.body ?? raw.text ?? raw.comment ?? ""),
    author: raw.author ? String(raw.author) : null,
    createdAt: normalizeDate(raw.createdAt ?? raw.created_at ?? raw.createdAtMatrix),
    rawData: raw
  };
}

function ticketText(ticket: MatrixTicketRecord) {
  return `${ticket.title}\n${ticket.body}`;
}

function uniqueTickets(tickets: MatrixTicketRecord[]) {
  const byId = new Map<string, MatrixTicketRecord>();
  for (const ticket of tickets) {
    byId.set(ticket.matrixTicketId, ticket);
  }

  return Array.from(byId.values());
}

class DemoMatrixAdapter implements MatrixAdapter {
  async fetchTickets() {
    return demoTickets;
  }

  async fetchTicketDetails(ticketId: string) {
    return demoTickets.find((ticket) => ticket.matrixTicketId === ticketId || ticket.ticketNumber === ticketId) ?? null;
  }

  async searchTicketsByPacket(packetCode: string) {
    const normalizedPacketCode = normalizePacketCode(packetCode);
    const tickets = demoTickets.filter((ticket) => {
      const textCodes = this.extractPacketCodesFromTicket(ticket);
      const replyCodes = (demoReplies[ticket.matrixTicketId] ?? []).flatMap((reply) =>
        extractLikelyPacketCodes(reply.body)
      );
      return [...textCodes, ...replyCodes].includes(normalizedPacketCode);
    });

    return uniqueTickets(tickets);
  }

  async createTicketForPacket(input: CreateTicketInput) {
    return {
      matrixTicketId: `matrix-demo-created-${input.packet.id}`,
      ticketNumber: `DEMO-${input.packet.normalizedPacketCode.replace(/[^A-Z0-9]/g, "").slice(-6)}`,
      title: input.title,
      body: input.body,
      status: "Open",
      author: "Demo Automation",
      createdAtMatrix: new Date(),
      updatedAtMatrix: new Date(),
      rawData: { source: "demo-created" }
    };
  }

  async fetchTicketReplies(ticketId: string) {
    return demoReplies[ticketId] ?? [];
  }

  extractPacketCodesFromTicket(ticket: MatrixTicketRecord) {
    return extractLikelyPacketCodes(ticketText(ticket));
  }

  async extractRelevantRepliesForPacket(ticket: MatrixTicketRecord, packetCode: string) {
    const normalizedPacketCode = normalizePacketCode(packetCode);
    return (demoReplies[ticket.matrixTicketId] ?? [])
      .filter((reply) => extractLikelyPacketCodes(reply.body).includes(normalizedPacketCode))
      .map((reply) => ({
        ...reply,
        matchedText: reply.body
      }));
  }
}

class HttpMatrixAdapter implements MatrixAdapter {
  constructor(private readonly baseUrl: string) {}

  private url(path: string, replacements: Record<string, string> = {}) {
    const resolvedPath = Object.entries(replacements).reduce(
      (pathValue, [key, value]) => pathValue.replaceAll(`{${key}}`, encodeURIComponent(value)),
      path
    );
    return new URL(resolvedPath, this.baseUrl).toString();
  }

  private async requestJson<T>(path: string, init?: RequestInit) {
    const apiKey = readEnv("MATRIX_API_KEY");
    const response = await withRetry(() =>
      fetch(path, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...init?.headers
        }
      })
    );

    if (!response.ok) {
      throw new Error(`Matrix request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  }

  async fetchTickets() {
    const path = readEnv("MATRIX_FETCH_TICKETS_PATH");
    if (!path) {
      return [];
    }

    const payload = await this.requestJson<unknown>(this.url(path));
    const rows = Array.isArray(payload) ? payload : (payload as { tickets?: unknown[] }).tickets ?? [];
    return rows.map((row) => asTicketRecord(row as Record<string, unknown>));
  }

  async fetchTicketDetails(ticketId: string) {
    const path = readEnv("MATRIX_TICKET_DETAILS_PATH");
    if (!path) {
      return null;
    }

    const payload = await this.requestJson<Record<string, unknown>>(this.url(path, { ticketId }));
    return asTicketRecord(payload);
  }

  async searchTicketsByPacket(packetCode: string) {
    const path = readEnv("MATRIX_SEARCH_PATH");
    if (!path) {
      const tickets = await this.fetchTickets();
      const normalizedPacketCode = normalizePacketCode(packetCode);
      return tickets.filter((ticket) => this.extractPacketCodesFromTicket(ticket).includes(normalizedPacketCode));
    }

    const url = path.includes("{packetCode}")
      ? this.url(path, { packetCode })
      : `${this.url(path)}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(packetCode)}`;
    const payload = await this.requestJson<unknown>(url);
    const rows = Array.isArray(payload) ? payload : (payload as { tickets?: unknown[] }).tickets ?? [];
    return rows.map((row) => asTicketRecord(row as Record<string, unknown>));
  }

  async createTicketForPacket(input: CreateTicketInput) {
    const path = readEnv("MATRIX_CREATE_TICKET_PATH");
    if (!path) {
      throw new Error("Matrix create ticket path is not configured.");
    }

    const payload = await this.requestJson<Record<string, unknown>>(this.url(path), {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        packetCode: input.packet.normalizedPacketCode,
        issueCategory: input.packet.issueCategory,
        sourceSheetRowNumber: input.packet.sourceSheetRowNumber
      })
    });

    return asTicketRecord(payload);
  }

  async fetchTicketReplies(ticketId: string) {
    const path = readEnv("MATRIX_REPLIES_PATH");
    if (!path) {
      return [];
    }

    const payload = await this.requestJson<unknown>(this.url(path, { ticketId }));
    const rows = Array.isArray(payload) ? payload : (payload as { replies?: unknown[]; comments?: unknown[] }).replies ?? [];
    return rows.map((row) => asReplyRecord(row as Record<string, unknown>));
  }

  extractPacketCodesFromTicket(ticket: MatrixTicketRecord) {
    return extractLikelyPacketCodes(ticketText(ticket));
  }

  async extractRelevantRepliesForPacket(ticket: MatrixTicketRecord, packetCode: string) {
    const normalizedPacketCode = normalizePacketCode(packetCode);
    const replies = await this.fetchTicketReplies(ticket.matrixTicketId);

    return replies
      .filter((reply) => extractLikelyPacketCodes(reply.body).includes(normalizedPacketCode))
      .map((reply) => ({
        ...reply,
        matchedText: reply.body
      }));
  }
}

class BrowserAutomationMatrixAdapter extends DemoMatrixAdapter {
  async fetchTickets(): Promise<MatrixTicketRecord[]> {
    throw new Error("Browser automation mode is intentionally isolated but not implemented for this MVP.");
  }
}

export async function createMatrixAdapter(): Promise<MatrixAdapter> {
  const settings = await getResolvedSettings();

  if (settings.matrixMode === "http" && settings.matrixBaseUrl) {
    return new HttpMatrixAdapter(settings.matrixBaseUrl);
  }

  if (settings.matrixMode === "browser") {
    return new BrowserAutomationMatrixAdapter();
  }

  return new DemoMatrixAdapter();
}

export function buildTicketTitle(packet: Pick<Packet, "normalizedPacketCode" | "issueCategory">) {
  return `${packet.issueCategory ?? "PhilSys packet concern"} - ${packet.normalizedPacketCode}`;
}
