"use client";

import { Bot, CheckSquare, HardDriveDownload, Play, RefreshCw, Square, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";

type RestorePacket = {
  id: string;
  packetCode: string;
  ticketId: string | null;
  ticketNumber: string | null;
  latestMatrixReply: string | null;
};

type RestoreJob = {
  packetId: string;
  trn: string;
  ticketId: string;
  ticketNumber: string;
  steps: { text: string; type: "info" | "ok" | "error" | "warn" }[];
  running: boolean;
  done: boolean;
  error: string;
  uploadedTo: string;
};

type Candidate = {
  packetId: string;
  packetCode: string;
  issueCategory: string | null;
  sourceSheetRowNumber: number;
  title: string;
  body: string;
};

export function AutomationClient() {
  const [mode, setMode] = useState<"review" | "auto" | "restore">("review");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Backend Restoration state
  const [restorePackets, setRestorePackets] = useState<RestorePacket[]>([]);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreJobs, setRestoreJobs] = useState<Map<string, RestoreJob>>(new Map());

  const loadRestorePackets = useCallback(async () => {
    setRestoreLoading(true);
    try {
      const res = await fetch("/api/packets?status=for_backend_restoration&pageSize=200");
      const data = await res.json();
      const packets: RestorePacket[] = (data.packets || []).map((p: any) => ({
        id: p.id,
        packetCode: p.packetCode,
        ticketId: p.ticketId ?? null,
        ticketNumber: p.ticketNumber ?? null,
        latestMatrixReply: p.latestMatrixReply ?? null,
      }));
      setRestorePackets(packets.filter(p => p.ticketId && p.ticketNumber));
    } catch {
      // ignore
    } finally {
      setRestoreLoading(false);
    }
  }, []);

  async function runRestore(packet: RestorePacket) {
    if (!packet.ticketId || !packet.ticketNumber) return;
    const jobKey = packet.id;

    setRestoreJobs(prev => new Map(prev).set(jobKey, {
      packetId: packet.id,
      trn: packet.packetCode,
      ticketId: packet.ticketId!,
      ticketNumber: packet.ticketNumber!,
      steps: [{ text: "Starting recovery...", type: "info" }],
      running: true,
      done: false,
      error: "",
      uploadedTo: "",
    }));

    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trn: packet.packetCode,
          ticketId: packet.ticketId,
          ticketNumber: packet.ticketNumber,
        }),
      });
      const payload = await res.json();

      const steps = (payload.steps || []).map((s: string) => ({
        text: s,
        type: s.startsWith("✅") ? "ok" : s.startsWith("❌") ? "error" : s.startsWith("⚠️") ? "warn" : "info",
      }));

      setRestoreJobs(prev => new Map(prev).set(jobKey, {
        packetId: packet.id,
        trn: packet.packetCode,
        ticketId: packet.matchedTicketId!,
        ticketNumber: packet.matchedTicketNumber!,
        steps,
        running: false,
        done: true,
        error: payload.error || "",
        uploadedTo: payload.uploadedTo || "",
      }));
    } catch (err: any) {
      setRestoreJobs(prev => new Map(prev).set(jobKey, {
        packetId: packet.id,
        trn: packet.packetCode,
        ticketId: packet.matchedTicketId!,
        ticketNumber: packet.matchedTicketNumber!,
        steps: [{ text: `Failed: ${err?.message}`, type: "error" }],
        running: false,
        done: true,
        error: err?.message || "Unknown error",
        uploadedTo: "",
      }));
    }
  }

  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selected.has(candidate.packetId)),
    [candidates, selected]
  );

  async function dryRun(recheck = false) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/automation/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recheck })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Dry run failed.");
      }
      setCandidates(payload.candidates);
      setSelected(new Set(payload.candidates.map((candidate: Candidate) => candidate.packetId)));
      setMessage(`${payload.candidates.length} packets ready for review.`);
    } catch (dryRunError) {
      setError(dryRunError instanceof Error ? dryRunError.message : "Dry run failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void dryRun(false);
    void loadRestorePackets();
  }, [loadRestorePackets]);

  function togglePacket(packetId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(packetId)) {
        next.delete(packetId);
      } else {
        next.add(packetId);
      }
      return next;
    });
  }

  async function createTickets() {
    if (selected.size === 0) {
      setError("Select at least one packet.");
      return;
    }

    if (!window.confirm(`Create ${selected.size} Matrix ticket(s)?`)) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/automation/create-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packetIds: Array.from(selected), confirmed: true })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Ticket creation failed.");
      }
      setMessage(`${payload.ticketsCreated} ticket(s) created.`);
      await dryRun(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Ticket creation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runAutoMode() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Auto run failed.");
      }
      setMessage(payload.skipped ? "Auto Mode is disabled." : "Auto Mode run completed.");
      await dryRun(true);
    } catch (autoError) {
      setError(autoError instanceof Error ? autoError.message : "Auto run failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Automation</h1>
          <p className="page-kicker">{mode === "review" ? "Review Mode" : "Auto Mode"}</p>
        </div>
        <div className="segmented" aria-label="Automation mode">
          <button
            className={`segment ${mode === "review" ? "segment-active" : ""}`}
            onClick={() => setMode("review")}
          >
            Review Mode
          </button>
          <button className={`segment ${mode === "auto" ? "segment-active" : ""}`} onClick={() => setMode("auto")}>
            Auto Mode
          </button>
          <button className={`segment ${mode === "restore" ? "segment-active" : ""}`} onClick={() => { setMode("restore"); void loadRestorePackets(); }}>
            <HardDriveDownload size={14} style={{ marginRight: 4 }} />
            Backend Restoration
          </button>
        </div>
      </header>

      {message ? <div className="alert">{message}</div> : null}
      {error ? <div className="alert error-text">{error}</div> : null}

      {mode === "review" ? (
        <>
          <div className="toolbar">
            <button className="btn" onClick={() => dryRun(true)} disabled={loading} title="Recheck Matrix">
              <RefreshCw size={16} />
              Recheck
            </button>
            <button className="btn btn-primary" onClick={createTickets} disabled={loading || selected.size === 0}>
              <CheckSquare size={16} />
              Create Tickets
            </button>
          </div>

          <div className="grid-two">
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Not Filed Packets</h2>
                <span className="muted">{candidates.length} found</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "54px" }}>Select</th>
                      <th>Packet</th>
                      <th>Concern Type</th>
                      <th>Row</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => (
                      <tr key={candidate.packetId}>
                        <td>
                          <button className="btn btn-ghost" onClick={() => togglePacket(candidate.packetId)}>
                            {selected.has(candidate.packetId) ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="mono">{candidate.packetCode}</td>
                        <td>{candidate.issueCategory ?? "Unspecified"}</td>
                        <td>{candidate.sourceSheetRowNumber}</td>
                      </tr>
                    ))}
                    {!loading && candidates.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          No not-filed packets.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Ticket Preview</h2>
                <span className="muted">{selectedCandidates.length} selected</span>
              </div>
              <div style={{ padding: 14 }}>
                {selectedCandidates[0] ? (
                  <>
                    <div className="field-label">{selectedCandidates[0].title}</div>
                    <pre className="pre">{selectedCandidates[0].body}</pre>
                  </>
                ) : (
                  <span className="muted">No packet selected.</span>
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Auto Mode</h2>
            <button className="btn btn-primary" onClick={runAutoMode} disabled={loading}>
              <Play size={16} />
              Run Auto Check
            </button>
          </div>
          <div style={{ padding: 14 }}>
            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">Default Mode</div>
                <div className="detail-value">Review Mode</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Candidates</div>
                <div className="detail-value">{candidates.length}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Selected</div>
                <div className="detail-value">{selected.size}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Action</div>
                <div className="detail-value">
                  <Bot size={16} /> Server-side
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : mode === "restore" ? (
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <HardDriveDownload size={18} style={{ marginRight: 8 }} />
              Backend Restoration Packets
            </h2>
            <button className="btn" onClick={loadRestorePackets} disabled={restoreLoading}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {restoreLoading && (
            <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
              <Loader2 size={16} className="spin" style={{ animation: "spin 1s linear infinite" }} />
              Loading backend restoration packets...
            </div>
          )}

          {!restoreLoading && restorePackets.length === 0 && (
            <div style={{ padding: "20px 16px", color: "var(--muted)" }}>
              No backend restoration packets with matched tickets found.
            </div>
          )}

          {restorePackets.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>TRN</th>
                    <th>Matched Ticket</th>
                    <th>Latest Reply</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {restorePackets.map(packet => {
                    const job = restoreJobs.get(packet.id);
                    return (
                      <>
                        <tr key={packet.id}>
                          <td className="mono" style={{ fontSize: "0.8rem" }}>{packet.packetCode}</td>
                          <td>#{packet.ticketNumber}</td>
                          <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.85rem", color: "var(--muted)" }}>
                            {packet.latestMatrixReply?.slice(0, 80) ?? "—"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {!job || (!job.running && !job.done) ? (
                              <button
                                className="btn btn-primary"
                                style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                                onClick={() => runRestore(packet)}
                              >
                                <HardDriveDownload size={14} />
                                Recover
                              </button>
                            ) : job.running ? (
                              <span style={{ color: "var(--muted)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 4 }}>
                                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Running...
                              </span>
                            ) : job.done && !job.error ? (
                              <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "0.85rem" }}>✅ Done</span>
                            ) : (
                              <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>❌ Failed</span>
                            )}
                          </td>
                        </tr>
                        {job && (job.running || job.done) && (
                          <tr key={`${packet.id}-steps`}>
                            <td colSpan={4} style={{ background: "var(--bg)", padding: "8px 16px 12px" }}>
                              <div style={{ fontFamily: "monospace", fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 2 }}>
                                {job.steps.map((step, i) => (
                                  <div key={i} style={{ color: step.type === "ok" ? "#16a34a" : step.type === "error" ? "var(--danger)" : step.type === "warn" ? "#b45309" : "var(--muted)" }}>
                                    {step.text}
                                  </div>
                                ))}
                                {job.done && job.uploadedTo && (
                                  <div style={{ marginTop: 4, color: "#1e40af" }}>
                                    📁 Uploaded to: {job.uploadedTo}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <style dangerouslySetInnerHTML={{__html: `@keyframes spin { 100% { transform: rotate(360deg); } }`}} />
        </section>
      ) : null}
    </>
  );
}
