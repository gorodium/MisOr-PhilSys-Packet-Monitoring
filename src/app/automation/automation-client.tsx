"use client";

import { HardDriveDownload, RefreshCw, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback, Fragment } from "react";

type RestorePacket = {
  id: string;
  packetCode: string;
  ticketId: string | null;
  ticketNumber: string | null;
  latestMatrixReply: string | null;
};

type RestoreStep = { text: string; type: "info" | "ok" | "error" | "warn" };
type RestoreJob = {
  packetId: string;
  trn: string;
  ticketId: string;
  ticketNumber: string;
  steps: RestoreStep[];
  running: boolean;
  done: boolean;
  error: string;
  uploadedTo: string;
};

export function AutomationClient() {
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

  useEffect(() => {
    void loadRestorePackets();
  }, [loadRestorePackets]);

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

      const steps: RestoreStep[] = (payload.steps || []).map((s: string) => ({
        text: s,
        type: s.startsWith("✅") ? "ok" : s.startsWith("❌") ? "error" : s.startsWith("⚠️") ? "warn" : "info",
      }));

      setRestoreJobs(prev => new Map(prev).set(jobKey, {
        packetId: packet.id,
        trn: packet.packetCode,
        ticketId: packet.ticketId!,
        ticketNumber: packet.ticketNumber!,
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
        ticketId: packet.ticketId!,
        ticketNumber: packet.ticketNumber!,
        steps: [{ text: `Failed: ${err?.message}`, type: "error" }],
        running: false,
        done: true,
        error: err?.message || "Unknown error",
        uploadedTo: "",
      }));
    }
  }

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
                    <Fragment key={packet.id}>
                      <tr>
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
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <style dangerouslySetInnerHTML={{__html: `@keyframes spin { 100% { transform: rotate(360deg); } }`}} />
      </section>
    </>
  );
}
