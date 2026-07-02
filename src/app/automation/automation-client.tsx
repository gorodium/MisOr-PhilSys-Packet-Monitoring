"use client";

import { Bot, CheckSquare, Play, RefreshCw, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Candidate = {
  packetId: string;
  packetCode: string;
  issueCategory: string | null;
  sourceSheetRowNumber: number;
  title: string;
  body: string;
};

export function AutomationClient() {
  const [mode, setMode] = useState<"review" | "auto">("review");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
  }, []);

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
      )}
    </>
  );
}

