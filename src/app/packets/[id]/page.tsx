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

  const syncHistory = await prisma.syncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 10
  });

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{packet.normalizedPacketCode}</h1>
          <p className="page-kicker">Source row {packet.sourceSheetRowNumber}</p>
        </div>
        <StatusBadge status={packet.syncStatus} label={STATUS_LABELS[packet.syncStatus]} />
      </header>

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
      </section>

      <div className="grid-two">
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Matched Text Snippets</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Match Type</th>
                  <th>Confidence</th>
                  <th>Snippet</th>
                </tr>
              </thead>
              <tbody>
                {packet.matches.map((match) => (
                  <tr key={match.id}>
                    <td className="mono">{match.matrixTicket.ticketNumber}</td>
                    <td>{match.matchType}</td>
                    <td>{Math.round(match.confidenceScore * 100)}%</td>
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

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-header">
          <h2 className="panel-title">Sync History</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Message</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {syncHistory.map((log) => (
                <tr key={log.id}>
                  <td>{log.syncType}</td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td>{log.message}</td>
                  <td>{formatDate(log.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
