import { Packet } from "@prisma/client";
import { demoReplies, demoTickets } from "@/lib/demo-data";
import { readEnv } from "@/lib/env";
import { extractLikelyPacketCodes, normalizePacketCode, isTrnLike } from "@/lib/packet-normalizer";
import { getResolvedSettings } from "@/lib/settings";
import { withRetry } from "@/lib/retry";
import {
  CreateTicketInput,
  MatrixAdapter,
  MatrixReply,
  MatrixTicketRecord,
  RelevantReply
} from "@/lib/matrix/types";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDate(value: unknown) {
  if (!value) {
    return null;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Redmine returns status as { id: number, name: string }.
 * Fall back through several possible shapes.
 */
function extractStatus(raw: Record<string, unknown>): string {
  const status = raw.status;
  if (status && typeof status === "object") {
    return String((status as Record<string, unknown>).name ?? "Unknown");
  }
  return String(status ?? raw.state ?? "Unknown");
}

/**
 * Redmine returns author/assigned_to as { id, name } objects.
 */
function extractName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return String(obj.name ?? obj.login ?? obj.id ?? "");
  }
  return null;
}

function asTicketRecord(raw: Record<string, unknown>): MatrixTicketRecord {
  const matrixTicketId = String(raw.id ?? raw.matrixTicketId ?? raw.ticketId ?? "");
  const ticketNumber = String(raw.ticketNumber ?? raw.number ?? raw.key ?? matrixTicketId);

  if (!matrixTicketId) {
    throw new Error("Matrix ticket payload is missing ticket identifiers.");
  }

  return {
    matrixTicketId,
    ticketNumber,
    title: String(raw.subject ?? raw.title ?? ""),
    body: String(raw.description ?? raw.body ?? raw.content ?? ""),
    status: extractStatus(raw),
    author: extractName(raw.author ?? raw.assigned_to ?? raw.created_by),
    createdAtMatrix: normalizeDate(raw.created_on ?? raw.createdAt ?? raw.created_at),
    updatedAtMatrix: normalizeDate(raw.updated_on ?? raw.updatedAt ?? raw.updated_at),
    rawData: raw
  };
}

/**
 * Redmine journals use `notes` for the comment body.
 * The author is a nested object { id, name }.
 */
function asReplyRecord(raw: Record<string, unknown>): MatrixReply {
  const id = String(raw.id ?? raw.replyId ?? raw.commentId ?? crypto.randomUUID());
  const body = String(raw.notes ?? raw.body ?? raw.text ?? raw.comment ?? "");
  const author = extractName(raw.user ?? raw.author ?? raw.created_by);
  const createdAt = normalizeDate(raw.created_on ?? raw.createdAt ?? raw.created_at);

  return { id, body, author, createdAt, rawData: raw };
}

/**
 * Extract all journal entries from a Redmine issue response.
 * Journals with empty notes are skipped (they are just field-change records).
 */
function extractJournalsFromIssuePayload(payload: Record<string, unknown>): MatrixReply[] {
  const issue = payload.issue as Record<string, unknown> | undefined;
  const journals = (issue?.journals ?? payload.journals) as unknown[] | undefined;

  if (!Array.isArray(journals)) return [];

  const replies: MatrixReply[] = [];

  // Optionally include the issue description as the first "reply"
  const description = String(issue?.description ?? "").trim();
  if (description) {
    replies.push({
      id: "description",
      body: description,
      author: extractName(issue?.author),
      createdAt: normalizeDate(issue?.created_on),
      rawData: { source: "description" }
    });
  }

  for (const journal of journals) {
    const entry = journal as Record<string, unknown>;
    const notes = String(entry.notes ?? "").trim();
    if (!notes) continue; // skip pure field-change journal entries
    replies.push(asReplyRecord(entry));
  }

  return replies;
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

// ---------------------------------------------------------------------------
// Demo adapter
// ---------------------------------------------------------------------------

class DemoMatrixAdapter implements MatrixAdapter {
  async fetchTickets() {
    return demoTickets;
  }

  async fetchTicketDetails(ticketId: string) {
    return demoTickets.find((t) => t.matrixTicketId === ticketId || t.ticketNumber === ticketId) ?? null;
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
      .map((reply) => ({ ...reply, matchedText: reply.body }));
  }
}

// ---------------------------------------------------------------------------
// HTTP / Redmine adapter
// ---------------------------------------------------------------------------

class HttpMatrixAdapter implements MatrixAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly projectId = "philsys-it-support-ticketing-2026";

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = readEnv("MATRIX_API_KEY") ?? "";
  }

  // ---- low-level HTTP ---------------------------------------------------

  private buildUrl(path: string, params?: Record<string, string>) {
    const base = new URL(path.startsWith("http") ? path : `${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        base.searchParams.set(key, value);
      }
    }
    return base.toString();
  }

  private resolvePathTemplate(pathTemplate: string, replacements: Record<string, string>) {
    return Object.entries(replacements).reduce(
      (p, [k, v]) => p.replaceAll(`{${k}}`, encodeURIComponent(v)),
      pathTemplate
    );
  }

  private async requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(this.apiKey ? { "X-Redmine-API-Key": this.apiKey } : {})
    };

    const response = await withRetry(() =>
      fetch(url, { ...init, headers: { ...headers, ...init?.headers } })
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Matrix API ${init?.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    return response.json() as Promise<T>;
  }

  // ---- Redmine paginated issue listing ----------------------------------

  private async fetchAllIssues(params: Record<string, string>): Promise<MatrixTicketRecord[]> {
    const limit = 100;
    let offset = 0;
    const allIssues: MatrixTicketRecord[] = [];

    while (true) {
      const url = this.buildUrl("/issues.json", {
        ...params,
        limit: String(limit),
        offset: String(offset)
      });

      const payload = await this.requestJson<{ issues?: unknown[]; total_count?: number }>(url);
      const page = (payload.issues ?? []) as Record<string, unknown>[];
      allIssues.push(...page.map(asTicketRecord));

      const total = Number(payload.total_count ?? allIssues.length);
      if (allIssues.length >= total || page.length < limit) break;
      offset += page.length;
    }

    return allIssues;
  }

  // ---- MatrixAdapter interface ------------------------------------------

  async fetchTickets(): Promise<MatrixTicketRecord[]> {
    return this.fetchAllIssues({
      project_id: this.projectId,
      status_id: "open"
    });
  }

  async fetchTicketDetails(ticketId: string): Promise<MatrixTicketRecord | null> {
    const pathTemplate = readEnv("MATRIX_TICKET_DETAILS_PATH") ?? "/issues/{ticketId}.json?include=journals";
    const path = this.resolvePathTemplate(pathTemplate, { ticketId });
    const url = this.buildUrl(path);

    try {
      const payload = await this.requestJson<Record<string, unknown>>(url);
      const issue = (payload.issue ?? payload) as Record<string, unknown>;
      return asTicketRecord(issue);
    } catch {
      return null;
    }
  }

  async searchTicketsByPacket(packetCode: string): Promise<MatrixTicketRecord[]> {
    // Search all statuses so we pick up the latest ticket regardless of whether older ones are closed
    const url = this.buildUrl("/issues.json", {
      project_id: this.projectId,
      subject: `~${packetCode}`,
      status_id: "*",
      limit: "25"
    });

    try {
      const payload = await this.requestJson<{ issues?: unknown[] }>(url);
      const issues = (payload.issues ?? []) as Record<string, unknown>[];
      return uniqueTickets(issues.map(asTicketRecord));
    } catch {
      return [];
    }
  }

  async createTicketForPacket(input: CreateTicketInput): Promise<MatrixTicketRecord> {
    const url = this.buildUrl("/issues.json");
    const payload = await this.requestJson<{ issue?: Record<string, unknown> }>(url, {
      method: "POST",
      body: JSON.stringify({
        issue: {
          project_id: this.projectId,
          subject: input.title,
          description: input.body,
          ...(input.trackerId ? { tracker_id: input.trackerId } : {}),
          ...(input.statusId ? { status_id: input.statusId } : {}),
          ...(input.priorityId ? { priority_id: input.priorityId } : {}),
          ...(input.assigneeId ? { assigned_to_id: input.assigneeId } : {}),
          ...(input.categoryId ? { category_id: input.categoryId } : {}),
          ...(input.startDate ? { start_date: input.startDate } : {}),
          ...(input.dueDate ? { due_date: input.dueDate } : {})
        }
      })
    });

    const issue = (payload.issue ?? payload) as Record<string, unknown>;
    return asTicketRecord(issue);
  }

  async fetchTicketReplies(ticketId: string): Promise<MatrixReply[]> {
    const pathTemplate = readEnv("MATRIX_REPLIES_PATH") ?? "/issues/{ticketId}.json?include=journals";
    const path = this.resolvePathTemplate(pathTemplate, { ticketId });
    const url = this.buildUrl(path);

    try {
      const payload = await this.requestJson<Record<string, unknown>>(url);
      return extractJournalsFromIssuePayload(payload);
    } catch {
      return [];
    }
  }

  /**
   * Extract packet codes from a ticket's title and description.
   * Packets are 29-digit TRN numbers (>= 20 digit chars after stripping non-digits).
   */
  extractPacketCodesFromTicket(ticket: MatrixTicketRecord): string[] {
    return extractLikelyPacketCodes(ticketText(ticket));
  }

  /**
   * Find journal entries (replies) that contain the specific TRN/packet code.
   * Matches if the normalised packet code appears anywhere in the comment body,
   * OR if the comment body contains a TRN-like value that matches the packet.
   */
  async extractRelevantRepliesForPacket(
    ticket: MatrixTicketRecord,
    packetCode: string
  ): Promise<RelevantReply[]> {
    const normalizedPacketCode = normalizePacketCode(packetCode);
    const replies = await this.fetchTicketReplies(ticket.matrixTicketId);

    return replies
      .filter((reply) => {
        const body = reply.body ?? "";
        // Direct substring match (normalised)
        if (normalizePacketCode(body).includes(normalizedPacketCode)) return true;
        // Match any TRN-like token in the reply that, when normalised, equals the packet
        return extractLikelyPacketCodes(body).some(
          (code) => normalizePacketCode(code) === normalizedPacketCode
        );
      })
      .map((reply) => ({ ...reply, matchedText: reply.body }));
  }
}

// ---------------------------------------------------------------------------
// Browser stub (not implemented)
// ---------------------------------------------------------------------------

class BrowserAutomationMatrixAdapter extends DemoMatrixAdapter {
  async fetchTickets(): Promise<MatrixTicketRecord[]> {
    throw new Error("Browser automation mode is not implemented.");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

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
