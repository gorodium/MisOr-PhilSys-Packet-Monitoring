import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value));
}

export default async function PacketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const packet = await prisma.packet.findUnique({
    where: { id: resolvedParams.id },
    include: {
      matrixTicket: true,
      matches: {
        include: { matrixTicket: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!packet) {
    notFound();
  }

  // Fetch any filing request for this TRN
  const filingRequest = await prisma.matrixFilingRequest.findFirst({
    where: { trn: packet.normalizedPacketCode },
    orderBy: { createdAt: "desc" }
  });

  // Determine filed-in-matrix date:
  // Prefer the filing request creation date (when admin filed it), fallback to matrix ticket creation
  const filedInMatrixDate = filingRequest?.createdAt ?? packet.matrixTicket?.createdAtMatrix ?? null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{packet.normalizedPacketCode}</h1>
          <p className="page-kicker">Source row {packet.sourceSheetRowNumber}</p>
        </div>
        <StatusBadge status={packet.syncStatus} label={STATUS_LABELS[packet.syncStatus]} />
      </header>

      {/* Main info grid */}
      <section className="detail-grid">
        <div className="detail-item">
          <div className="detail-label">Packet Code</div>
          <div className="detail-value mono">{packet.normalizedPacketCode}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Issue Category</div>
          <div className="detail-value">{packet.issueCategory ?? "Unspecified"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Matched Ticket</div>
          <div className="detail-value mono">{packet.ticketNumber ?? "None"}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Last Checked</div>
          <div className="detail-value">{formatDate(packet.lastCheckedAt)}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">Filed in Matrix</div>
          <div className="detail-value">{filedInMatrixDate ? formatDate(filedInMatrixDate) : "Not yet filed"}</div>
        </div>
      </section>

      {/* Filing Request Info Box */}
      {filingRequest && (
        <section className="panel" style={{ marginTop: 14, borderLeft: "3px solid var(--primary, #1d4ed8)" }}>
          <div className="panel-header">
            <h2 className="panel-title">Filing Request Details</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Submitted {formatDate(filingRequest.createdAt)} · Status: <strong>{filingRequest.status}</strong>
            </span>
          </div>
          <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 2 }}>TRN</div>
              <div style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{filingRequest.trn}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 2 }}>Tracker</div>
              <div style={{ fontSize: "0.85rem" }}>{filingRequest.actionType}</div>
            </div>
            {filingRequest.remarks && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 2 }}>Remarks</div>
                <div style={{ fontSize: "0.85rem" }}>{filingRequest.remarks}</div>
              </div>
            )}
            {(filingRequest.firstName || filingRequest.lastName) && (
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 2 }}>Name</div>
                <div style={{ fontSize: "0.85rem" }}>
                  {[filingRequest.firstName, filingRequest.middleName, filingRequest.lastName].filter(Boolean).join(" ")}
                </div>
              </div>
            )}
            {filingRequest.sex && (
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 2 }}>Sex</div>
                <div style={{ fontSize: "0.85rem" }}>{filingRequest.sex}</div>
              </div>
            )}
            {filingRequest.birthday && (
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 2 }}>Birthday</div>
                <div style={{ fontSize: "0.85rem" }}>{formatDateOnly(filingRequest.birthday)}</div>
              </div>
            )}
          </div>
        </section>
      )}

      <div style={{ marginTop: 14 }}>
        {/* Ticket History */}
        <section className="panel" style={{ display: "flex", flexDirection: "column", maxHeight: "600px" }}>
          <div className="panel-header" style={{ flexShrink: 0 }}>
            <h2 className="panel-title">Ticket History</h2>
          </div>
          <div style={{ padding: "16px", overflowY: "auto", flexGrow: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
            {(() => {
              const uniqueTickets = Array.from(new Map(packet.matches.map(m => [m.matrixTicket.id, m.matrixTicket])).values());
              if (uniqueTickets.length === 0) {
                return <span className="muted">No matches recorded.</span>;
              }

              return uniqueTickets.map(ticket => {
                const rawData = ticket.rawData as any;
                
                // Combine original description and replies
                const timeline = [];
                if (rawData?.description) {
                  timeline.push({
                    id: `desc-${ticket.id}`,
                    author: ticket.author ?? (rawData?.author?.name) ?? "Unknown",
                    createdAt: ticket.createdAtMatrix ?? rawData?.created_on,
                    text: rawData.description,
                    isOriginal: true
                  });
                }
                
                if (rawData?.journals && Array.isArray(rawData.journals)) {
                  rawData.journals.forEach((j: any) => {
                    if (j.notes && j.notes.trim()) {
                      timeline.push({
                        id: `journal-${j.id}`,
                        author: j.user?.name ?? "Unknown",
                        createdAt: j.created_on,
                        text: j.notes,
                        isOriginal: false
                      });
                    }
                  });
                }

                // Sort ascending by date
                timeline.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

                return (
                  <div key={ticket.id} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {uniqueTickets.length > 1 && (
                      <h3 style={{ fontSize: "14px", fontWeight: 600, borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                        Ticket: {ticket.ticketNumber}
                      </h3>
                    )}
                    {timeline.length === 0 ? (
                      <span className="muted" style={{ fontSize: "13px" }}>No description or replies.</span>
                    ) : (
                      timeline.map(item => (
                        <div key={item.id} style={{
                          background: item.isOriginal ? "var(--surface)" : "var(--background)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          overflow: "hidden"
                        }}>
                          <div style={{ 
                            background: "var(--border)", 
                            padding: "6px 12px", 
                            fontSize: "12px", 
                            display: "flex", 
                            justifyContent: "space-between",
                            color: "var(--muted)"
                          }}>
                            <strong>{item.author}</strong>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                          <div style={{ padding: "12px", fontSize: "13px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {item.text}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </section>
      </div>
    </>
  );
}