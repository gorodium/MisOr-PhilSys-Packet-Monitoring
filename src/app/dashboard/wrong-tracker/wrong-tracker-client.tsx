"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Send, RefreshCw, Loader2, X, ExternalLink, FileText } from "lucide-react";

type WrongTrackerPacket = {
  id: string;
  packetCode: string;
  normalizedPacketCode: string;
  issueCategory: string | null;
  ticketNumber: string | null;
  latestMatrixReply: string | null;
  latestMatrixReplyAuthor: string | null;
  latestMatrixReplyDate: string | null;
  matrixTicket?: {
    matrixTicketId: string;
    title: string;
  } | null;
};

function getNextWorkday(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  if (result.getDay() === 6) result.setDate(result.getDate() + 2);
  else if (result.getDay() === 0) result.setDate(result.getDate() + 1);
  return result;
}

function formatDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

const CATEGORIES = [
  "Admin Portal", "Defective", "Device Not Available", "DSWD Hypercare", "DSWD Uplift",
  "Duplicate PhilID and ePhilID", "ePhilID Password request", "FindMyTRN", "Healing",
  "Login Issue", "Lost Registration", "Manual Upload", "MIssing Packet", "Multi Protect",
  "MVS Concerns", "NO PSN", "No QR", "No QR and Photo", "Onboarding", "Packet Issue",
  "Packet Retrieval", "Photo Mismatch", "POB Mismatch", "Regclient Issue", "Remapping",
  "Stolen", "Sync Failure", "Transmittal", "Unable to Upload", "With PSN"
];

export function WrongTrackerClient() {
  const [packets, setPackets] = useState<WrongTrackerPacket[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [selectedPacket, setSelectedPacket] = useState<WrongTrackerPacket | null>(null);
  const [trackerId, setTrackerId] = useState<number | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState<number>(1);
  const [priorityId, setPriorityId] = useState<number>(2);
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | string>("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Options
  const [trackersList, setTrackersList] = useState<{ id: number; name: string }[]>([]);
  const [assigneesList, setAssigneesList] = useState<{ id: number; name: string }[]>([]);

  async function fetchPackets() {
    setLoading(true);
    try {
      const res = await fetch("/api/packets/wrong-tracker");
      if (res.ok) {
        const data = await res.json();
        setPackets(data.packets || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOptions() {
    try {
      const res = await fetch("/api/matrix/options");
      if (res.ok) {
        const data = await res.json();
        if (data.assignees) setAssigneesList(data.assignees);
        if (data.trackers) {
          const allowedTrackers = data.trackers.filter((t: any) =>
            t.name === "ePhilID TRN Concerns" || t.name === "Updating Concerns" || t.name === "ePhilID QR Concerns"
          );
          setTrackersList(allowedTrackers);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchPackets();
    fetchOptions();
  }, []);

  function openModal(packet: WrongTrackerPacket) {
    setSelectedPacket(packet);

    // Try to auto-detect tracker from the reply message
    const replyLower = (packet.latestMatrixReply || "").toLowerCase();
    let defaultTrackerName = "ePhilID TRN Concerns";
    if (replyLower.includes("qr") || replyLower.includes("photo")) {
      defaultTrackerName = "ePhilID QR Concerns";
    } else if (replyLower.includes("updating")) {
      defaultTrackerName = "Updating Concerns";
    }

    const foundTracker = trackersList.find(t => t.name === defaultTrackerName);
    setTrackerId(foundTracker ? foundTracker.id : (trackersList[0]?.id || ""));
    setSubject(`${defaultTrackerName} - Misamis Oriental`);
    setDescription(`TRN: ${packet.normalizedPacketCode}\n\nDescribe the TRN issue/s: ${packet.issueCategory || ""}`);
    setStatusId(1);
    setPriorityId(2);
    setAssigneeId("");
    setCategoryId("");
    const today = new Date();
    setStartDate(formatDate(today));
    setDueDate(formatDate(getNextWorkday(today)));
  }

  function handleTrackerChange(id: number) {
    setTrackerId(id);
    const tracker = trackersList.find(t => t.id === id);
    if (tracker) {
      setSubject(`${tracker.name} - Misamis Oriental`);
    }
  }

  async function handleFileToMatrix(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPacket) return;

    // This uses a new API endpoint that files directly for a packet (not MatrixFilingRequest)
    setSubmitting(true);
    try {
      const res = await fetch(`/api/packets/wrong-tracker/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: selectedPacket.id,
          trackerId: trackerId || undefined,
          title: subject,
          body: description,
          statusId: statusId || undefined,
          priorityId: priorityId || undefined,
          assigneeId: assigneeId || undefined,
          categoryName: categoryId || undefined,
          startDate: startDate || undefined,
          dueDate: dueDate || undefined,
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(`Ticket filed successfully! Ticket #${data.ticketNumber}`);
        setSelectedPacket(null);
        fetchPackets();
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || "Failed to file ticket to Matrix");
      }
    } catch (e) {
      setErrorMessage("Submission failed. Check network connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1300px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text)", display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={24} color="#f59e0b" />
            Wrong Tracker — Refile Queue
          </h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "14px" }}>
            Packets where Matrix replied "Kindly file this TRN to the correct tracker". Select a packet to refile it.
          </p>
        </div>
        <button onClick={fetchPackets} disabled={loading} className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </div>

      {/* Success / Error messages */}
      {successMessage && (
        <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", color: "#065f46", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46" }}><X size={16} /></button>
        </div>
      )}
      {errorMessage && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}><X size={16} /></button>
        </div>
      )}

      {/* Packet List */}
      <div style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "rgba(245,158,11,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
            Packets Needing Refiling
            {!loading && <span style={{ marginLeft: "8px", background: "#f59e0b", color: "#fff", borderRadius: "100px", padding: "2px 10px", fontSize: "12px" }}>{packets.length}</span>}
          </h3>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>Packet / TRN</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Current Ticket</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Matrix Reply</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Reply Date</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: "48px", textAlign: "center", color: "var(--muted)" }}>
                    <Loader2 size={24} className="spin" style={{ display: "block", margin: "0 auto 8px" }} />
                    Loading packets...
                  </td>
                </tr>
              ) : packets.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "48px", textAlign: "center", color: "var(--muted)" }}>
                    <FileText size={32} style={{ display: "block", margin: "0 auto 8px", opacity: 0.3 }} />
                    No packets found with "Kindly file to correct tracker" replies.
                  </td>
                </tr>
              ) : (
                packets.map(packet => (
                  <tr key={packet.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ fontWeight: 600, fontFamily: "monospace", fontSize: "13px" }}>{packet.packetCode}</div>
                      {packet.issueCategory && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{packet.issueCategory}</div>}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {packet.ticketNumber ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "rgba(59,130,246,0.1)", color: "var(--primary)", padding: "4px 8px", borderRadius: "100px", fontSize: "12px", fontWeight: 600 }}>
                          <ExternalLink size={12} /> #{packet.ticketNumber}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "12px" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", maxWidth: "400px" }}>
                      <div style={{ fontSize: "13px", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "8px 10px", lineHeight: "1.5" }}>
                        {packet.latestMatrixReply}
                      </div>
                      {packet.latestMatrixReplyAuthor && (
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>— {packet.latestMatrixReplyAuthor}</div>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px", whiteSpace: "nowrap", color: "var(--muted)", fontSize: "13px" }}>
                      {packet.latestMatrixReplyDate ? new Date(packet.latestMatrixReplyDate).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <button
                        onClick={() => openModal(packet)}
                        className="btn btn-primary"
                        style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "8px 14px" }}
                      >
                        <Send size={14} /> File to Correct Tracker
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filing Modal */}
      {selectedPacket && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => !submitting && setSelectedPacket(null)}>
          <div style={{ backgroundColor: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 700, color: "var(--text)" }}>File to Correct Tracker</h2>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)", fontFamily: "monospace" }}>{selectedPacket.packetCode}</p>
              </div>
              {!submitting && (
                <button onClick={() => setSelectedPacket(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: "4px" }}>
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Matrix Reply Preview */}
            <div style={{ margin: "16px 24px 0", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Matrix Reply</div>
              <div style={{ fontSize: "13px", color: "#b45309", lineHeight: "1.5" }}>{selectedPacket.latestMatrixReply}</div>
            </div>

            {/* Form */}
            <form onSubmit={handleFileToMatrix} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Tracker */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Tracker <span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="input" style={{ flex: 1 }} value={trackerId} onChange={e => handleTrackerChange(Number(e.target.value))} required>
                  <option value="">Select tracker...</option>
                  {trackersList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {/* Subject */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Subject <span style={{ color: "var(--danger)" }}>*</span></label>
                <input className="input" style={{ flex: 1 }} value={subject} onChange={e => setSubject(e.target.value)} required />
              </div>

              {/* Description */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Description</label>
                <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "4px" }}>
                  <div style={{ padding: "6px", borderBottom: "1px solid var(--border)", background: "#f8fafc", fontSize: "12px", display: "flex", gap: "8px" }}>
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>Edit</span>
                  </div>
                  <textarea className="input" style={{ width: "100%", border: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0, resize: "vertical" }} rows={5} value={description} onChange={e => setDescription(e.target.value)} />
                </div>
              </div>

              {/* Assignee */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Assignee <span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="input" style={{ flex: 1 }} value={assigneeId} onChange={e => setAssigneeId(Number(e.target.value))} required>
                  <option value="">Select assignee...</option>
                  {assigneesList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* Category */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Category <span style={{ color: "var(--danger)" }}>*</span></label>
                <select className="input" style={{ flex: 1 }} value={categoryId as string} onChange={e => setCategoryId(e.target.value)} required>
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Dates */}
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flex: 1 }}>
                  <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Start Date</label>
                  <input className="input" type="date" style={{ flex: 1 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flex: 1 }}>
                  <label style={{ width: "80px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px", flexShrink: 0 }}>Due Date</label>
                  <input className="input" type="date" style={{ flex: 1 }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
                <button type="button" onClick={() => setSelectedPacket(null)} className="btn btn-outline" disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                  {submitting ? "Filing..." : "Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }` }} />
    </div>
  );
}
