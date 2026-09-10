"use client";

import { HardDriveDownload, RefreshCw, Loader2, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { useEffect, useState, useCallback, Fragment } from "react";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type RestorePacket = {
  id: string;
  packetCode: string;
  ticketId: string | null;
  ticketNumber: string | null;
  latestMatrixReply: string | null;
  proLptFolder: string;
  province: string;
};

type StepLine = { text: string; type: "info" | "ok" | "error" | "warn" };

type JobState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "success"; steps: StepLine[]; uploadedTo: string; destFolder: string; packetName: string; commentPosted: boolean; alreadyUploaded: boolean; isRestored?: boolean }
  | { phase: "error"; steps: StepLine[]; error: string };

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function classifyStep(s: string): StepLine["type"] {
  if (s.startsWith("✅")) return "ok";
  if (s.startsWith("❌")) return "error";
  if (s.startsWith("⚠️")) return "warn";
  return "info";
}

function StepLog({ steps }: { steps: StepLine[] }) {
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 6,
      padding: "10px 14px",
      fontFamily: "monospace",
      fontSize: "0.76rem",
      lineHeight: 1.6,
      display: "flex",
      flexDirection: "column",
      gap: 1,
      maxHeight: 280,
      overflowY: "auto",
    }}>
      {steps.map((s, i) => (
        <div key={i} style={{
          color: s.type === "ok" ? "#4ade80"
            : s.type === "error" ? "#f87171"
            : s.type === "warn" ? "#fbbf24"
            : "#94a3b8",
        }}>
          {s.text}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

export function AutomationClient() {
  const [restorePackets, setRestorePackets] = useState<RestorePacket[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [jobs, setJobs] = useState<Map<string, JobState>>(new Map());
  const [commentingFor, setCommentingFor] = useState<Set<string>>(new Set());

  const loadRestorePackets = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/packets?status=for_backend_restoration&pageSize=200");
      const data = await res.json();
      const packets: RestorePacket[] = [];
      const newJobs = new Map<string, JobState>();

      (data.packets || []).forEach((p: any) => {
        if (!p.ticketId || !p.ticketNumber) return;

        packets.push({
          id: p.id,
          packetCode: p.packetCode,
          ticketId: p.ticketId,
          ticketNumber: p.ticketNumber,
          latestMatrixReply: p.latestMatrixReply ?? null,
          proLptFolder: p.proLptFolder ?? "",
          province: p.province ?? "",
        });

        if (p.restorationUploaded || p.restorationCommented) {
          newJobs.set(p.id, {
            phase: "success",
            steps: [{ text: "✅ Recovered from previous session", type: "ok" }],
            uploadedTo: `/Misamis Oriental/ePhilID TRN Concerns/${p.ticketNumber}/${p.packetCode}.zip`,
            destFolder: `/Misamis Oriental/ePhilID TRN Concerns/${p.ticketNumber}`,
            packetName: `${p.packetCode}.zip`,
            alreadyUploaded: true,
            commentPosted: p.restorationCommented === true,
            isRestored: true,
          });
        }
      });

      setRestorePackets(packets);
      setJobs(prev => {
        const merged = new Map(prev);
        for (const [k, v] of newJobs) {
          if (!merged.has(k)) merged.set(k, v);
        }
        return merged;
      });
    } catch {
      // ignore
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void loadRestorePackets(); }, [loadRestorePackets]);

  // ── Recover (search + copy) ──
  async function runRestore(packet: RestorePacket) {
    if (!packet.ticketId || !packet.ticketNumber) return;
    const key = packet.id;

    setJobs(prev => new Map(prev).set(key, { phase: "searching" }));

    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: packet.id,
          trn: packet.packetCode,
          ticketId: packet.ticketId,
          ticketNumber: packet.ticketNumber,
          proLptFolder: packet.proLptFolder || undefined,
        }),
      });
      const payload = await res.json();
      const steps: StepLine[] = (payload.steps || []).map((s: string) => ({
        text: s,
        type: classifyStep(s),
      }));

      if (payload.success) {
        setJobs(prev => new Map(prev).set(key, {
          phase: "success",
          steps,
          uploadedTo: payload.uploadedTo ?? "",
          destFolder: payload.destFolder ?? "",
          packetName: payload.packetName ?? "",
          alreadyUploaded: payload.alreadyUploaded ?? false,
          commentPosted: false,
        }));
      } else {
        setJobs(prev => new Map(prev).set(key, {
          phase: "error",
          steps: steps.length > 0 ? steps : [{ text: `❌ ${payload.error || "Unknown error"}`, type: "error" }],
          error: payload.error || "Unknown error",
        }));
      }
    } catch (err: any) {
      setJobs(prev => new Map(prev).set(key, {
        phase: "error",
        steps: [{ text: `❌ ${err?.message}`, type: "error" }],
        error: err?.message,
      }));
    }
  }

  // ── Post comment manually ──
  async function postComment(packet: RestorePacket, job: JobState) {
    if (job.phase !== "success" || !packet.ticketId) return;

    const key = packet.id;
    setCommentingFor(prev => new Set(prev).add(key));
    try {
      const res = await fetch("/api/matrix/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: packet.id,
          ticketId: packet.ticketId,
          ticketNumber: packet.ticketNumber,
          autoFormatParams: {
            packetCode: packet.packetCode,
            destFolder: job.destFolder,
          }
        }),
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      setJobs(prev => {
        const existing = prev.get(key);
        if (existing?.phase !== "success") return prev;
        return new Map(prev).set(key, { ...existing, commentPosted: true });
      });
    } catch (err: any) {
      alert(`Failed to post comment: ${err?.message}`);
    } finally {
      setCommentingFor(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  // ── Reset job for a packet ──
  function resetJob(key: string) {
    setJobs(prev => {
      const m = new Map(prev);
      m.delete(key);
      return m;
    });
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Backend Restoration</h1>
          <p className="page-kicker">Recover packets from Central Office NAS</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <HardDriveDownload size={18} style={{ marginRight: 8 }} />
            Backend Restoration Packets
          </h2>
          <button className="btn" onClick={loadRestorePackets} disabled={listLoading}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {listLoading && (
          <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Loading backend restoration packets...
          </div>
        )}

        {!listLoading && restorePackets.length === 0 && (
          <div style={{ padding: "20px 16px", color: "var(--muted)" }}>
            No backend restoration packets with matched tickets found.
          </div>
        )}

        {restorePackets.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 280 }}>TRN</th>
                  <th>Matched Ticket</th>
                  <th>Latest Reply</th>
                  <th style={{ textAlign: "right", minWidth: 140 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {restorePackets.map(packet => {
                  const job = jobs.get(packet.id) ?? { phase: "idle" };
                  const isCommenting = commentingFor.has(packet.id);

                  return (
                    <Fragment key={packet.id}>
                      {/* ── Main row ── */}
                      <tr>
                        {/* TRN cell */}
                        <td>
                          <div className="mono" style={{
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            color: "var(--foreground)",
                            wordBreak: "break-all",
                          }}>
                            {packet.packetCode}
                          </div>
                          {(packet.proLptFolder || packet.province) && (
                            <div style={{ fontSize: "0.75rem", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {packet.proLptFolder && (
                                <span style={{
                                  background: "#dbeafe",
                                  color: "#1d4ed8",
                                  padding: "1px 7px",
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  fontSize: "0.72rem",
                                }}>
                                  {packet.proLptFolder}
                                </span>
                              )}
                              {packet.province && (
                                <span style={{ color: "#64748b", fontSize: "0.72rem" }}>
                                  {packet.province}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Ticket cell */}
                        <td style={{ whiteSpace: "nowrap" }}>#{packet.ticketNumber}</td>

                        {/* Reply preview cell */}
                        <td style={{
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: "0.83rem",
                          color: "var(--muted)",
                        }}>
                          {packet.latestMatrixReply?.slice(0, 90) ?? "—"}
                        </td>

                        {/* Action cell */}
                        <td style={{ textAlign: "right" }}>
                          {job.phase === "idle" && (
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: "0.8rem", padding: "5px 14px" }}
                              onClick={() => runRestore(packet)}
                            >
                              <HardDriveDownload size={14} />
                              Recover
                            </button>
                          )}

                          {job.phase === "searching" && (
                            <span style={{ color: "var(--muted)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                              Searching…
                            </span>
                          )}

                          {job.phase === "success" && (
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}>
                                <CheckCircle size={14} /> {job.alreadyUploaded ? "Already Uploaded" : "Uploaded"}
                              </span>
                              {!job.commentPosted ? (
                                <button
                                  className="btn"
                                  style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                                  disabled={isCommenting}
                                  onClick={() => postComment(packet, job)}
                                >
                                  {isCommenting
                                    ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                                    : <MessageSquare size={13} />}
                                  {isCommenting ? "Posting…" : "Post Comment"}
                                </button>
                              ) : (
                                <span style={{ color: "#0369a1", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 3 }}>
                                  <MessageSquare size={13} /> Replied to Matrix
                                </span>
                              )}
                              <button
                                className="btn"
                                style={{ fontSize: "0.75rem", padding: "3px 8px", opacity: 0.65 }}
                                onClick={() => resetJob(packet.id)}
                                title="Reset this entry"
                              >
                                Reset
                              </button>
                            </div>
                          )}

                          {job.phase === "error" && (
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                              <span style={{ color: "var(--danger)", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}>
                                <XCircle size={14} /> Failed
                              </span>
                              <button
                                className="btn"
                                style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                                onClick={() => resetJob(packet.id)}
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* ── Step log expansion row ── */}
                      {(job.phase === "searching" || (job.phase === "success" && !job.isRestored) || job.phase === "error") && (
                        <tr>
                          <td colSpan={4} style={{ padding: "0 16px 14px", background: "var(--bg)" }}>
                            {job.phase === "searching" && (
                              <div style={{ color: "var(--muted)", fontSize: "0.83rem", display: "flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
                                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                                Searching NASes for packet, please wait…
                              </div>
                            )}
                            {(job.phase === "success" || job.phase === "error") && (
                              <div style={{ marginTop: 2 }}>
                                <StepLog steps={job.steps} />
                                {job.phase === "success" && (
                                  <div style={{
                                    marginTop: 8,
                                    background: "#f0fdf4",
                                    border: "1px solid #86efac",
                                    borderRadius: 6,
                                    padding: "8px 12px",
                                    fontSize: "0.8rem",
                                    color: "#15803d",
                                    fontFamily: "monospace",
                                  }}>
                                    📁 {job.uploadedTo}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { 100% { transform: rotate(360deg); } }` }} />
      </section>
    </>
  );
}
