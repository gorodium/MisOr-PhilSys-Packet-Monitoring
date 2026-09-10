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

      <div className="grid-two" style={{ marginTop: 14 }}>
        {/* Ticket History (formerly Matched Text Snippets) */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Ticket History</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Match Type</th>
                  <th>User</th>
                  <th>Snippet</th>
                </tr>
              </thead>
              <tbody>
                {packet.matches.map((match) => (
                  <tr key={match.id}>
                    <td className="mono">{match.matrixTicket.ticketNumber}</td>
                    <td>{match.matchType}</td>
                    <td>{match.matrixTicket.author ?? "—"}</td>
                    <td>{match.matchedText}</td>
                  </tr>
                ))}
                {packet.matches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No matches recorded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Latest Matrix Reply</h2>
          </div>
          <div style={{ padding: 14 }}>
            {packet.latestMatrixReply ? (
              <>
                <pre className="pre">{packet.latestMatrixReply}</pre>
                <p className="muted">
                  {packet.latestMatrixReplyAuthor ?? "Unknown author"} - {formatDate(packet.latestMatrixReplyDate)}
                </p>
              </>
            ) : (
              <span className="muted">No relevant reply recorded.</span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}