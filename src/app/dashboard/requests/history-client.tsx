"use client";

import { useState, useEffect } from "react";
import { Clock, CheckCircle, XCircle, Send, X, RefreshCw, Trash2 } from "lucide-react";

type FilingRequest = {
  id: string;
  trn: string;
  actionType: string;
  remarks: string;
  status: string;
  matrixTicketId: string | null;
  createdAt: string;
};

function getNextWorkday(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  if (result.getDay() === 6) { // Saturday
    result.setDate(result.getDate() + 2);
  } else if (result.getDay() === 0) { // Sunday
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function formatDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`; // Input type="date" expects yyyy-mm-dd
}

export function HistoryClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [requests, setRequests] = useState<FilingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<FilingRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal form state
  const [trackerId, setTrackerId] = useState<number | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState<number>(1); // 1 = New typically
  const [priorityId, setPriorityId] = useState<number>(2); // 2 = Normal typically
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [assigneesList, setAssigneesList] = useState<{id: number, name: string}[]>([]);
  const [categoriesList, setCategoriesList] = useState<{id: number, name: string}[]>([]);
  const [trackersList, setTrackersList] = useState<{id: number, name: string}[]>([]);

  const CATEGORIES = [
    "Admin Portal",
    "Defective",
    "Device Not Available",
    "DSWD Hypercare",
    "DSWD Uplift",
    "Duplicate PhilID and ePhilID",
    "ePhilID Password request",
    "FindMyTRN",
    "Healing",
    "Login Issue",
    "Lost Registration",
    "Manual Upload",
    "MIssing Packet",
    "Multi Protect",
    "MVS Concerns",
    "NO PSN",
    "No QR",
    "No QR and Photo",
    "Onboarding",
    "Packet Issue",
    "Packet Retrieval",
    "Photo Mismatch",
    "POB Mismatch",
    "Regclient Issue",
    "Remapping",
    "Stolen",
    "Sync Failure",
    "Transmittal",
    "Unable to Upload",
    "With PSN"
  ];

  async function fetchRequests() {
    setLoadingRequests(true);
    try {
      const res = await fetch("/api/filing");
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function fetchOptions() {
    try {
      const res = await fetch("/api/matrix/options");
      if (res.ok) {
        const data = await res.json();
        if (data.assignees) setAssigneesList(data.assignees);
        // We ignore data.categories because the Matrix API returns 403 for it.
        // We will use the hardcoded CATEGORIES array instead.
        if (data.trackers) {
          const allowedTrackers = data.trackers.filter((t: any) => 
            t.name === "ePhilID TRN Concerns" || t.name === "Updating Concerns"
          );
          setTrackersList(allowedTrackers);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchRequests();
    fetchOptions();
  }, []);

  const [successMessage, setSuccessMessage] = useState("");

  function openModal(req: FilingRequest) {
    setSelectedReq(req);
    
    // Auto-select tracker based on actionType if we have trackers loaded
    const defaultTrackerName = req.actionType === "Updating" ? "Updating Concerns" : "ePhilID TRN Concerns";
    const foundTracker = trackersList.find(t => t.name === defaultTrackerName);
    setTrackerId(foundTracker ? foundTracker.id : (trackersList[0]?.id || ""));
    
    setSubject(`ePhilID TRN Concerns - Misamis Oriental`);
    
    // We populate with the EXACT template the user requested previously.
    setDescription(`TRN: ${req.trn}\n\nDescribe the TRN issue/s: ${req.remarks}`);
    
    setStatusId(1);
    setPriorityId(2);
    setAssigneeId("");
    setCategoryId("");
    
    const today = new Date();
    setStartDate(formatDate(today));
    setDueDate(formatDate(getNextWorkday(today)));

    setIsModalOpen(true);
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    // We store the string in categoryId for now, we'll map it to an ID on the backend
    setCategoryId(val as any);
    
    if (val !== "") {
      if (val === "With PSN") {
        const aaron = assigneesList.find(a => a.name.toLowerCase().includes("aaron"));
        if (aaron) setAssigneeId(aaron.id);
      } else if (val === "NO PSN") {
        const joshua = assigneesList.find(a => a.name.toLowerCase().includes("joshua"));
        if (joshua) setAssigneeId(joshua.id);
      }
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedReq(null);
  }

  async function handleFileToMatrix(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReq) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/filing/${selectedReq.id}/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackerId: trackerId || undefined,
          title: subject,
          body: description,
          statusId: statusId || undefined,
          priorityId: priorityId || undefined,
          assigneeId: assigneeId || undefined,
          categoryName: categoryId || undefined, // Passing the string name
          startDate: startDate || undefined,
          dueDate: dueDate || undefined,
        })
      });

      if (res.ok) {
        setSuccessMessage("Filing request submitted to Matrix successfully! The ticket has been created.");
        closeModal();
        fetchRequests(); // Refresh table
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to file to Matrix");
      }
    } catch (e) {
      alert("Submission failed. Check network connection.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this filing request? This will allow it to be requested again.")) return;
    
    try {
      const res = await fetch(`/api/filing/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchRequests();
      } else {
        alert("Failed to delete request.");
      }
    } catch (e) {
      alert("An error occurred while deleting.");
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Filing History</h1>
          <p className="page-kicker">Review past Matrix Filing requests</p>
        </div>
      </header>

      <section className="panel" style={{ overflowX: "auto" }}>
        {loadingRequests ? (
          <p className="muted" style={{ padding: "20px" }}>Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="muted" style={{ padding: "20px" }}>No requests submitted yet.</p>
        ) : (
          <table className="data-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--muted)" }}>
                <th>Date</th>
                <th>TRN</th>
                <th>Tracker</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>
                  <td style={{ verticalAlign: "middle" }}>{new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ fontFamily: "monospace", verticalAlign: "middle" }}>{req.trn}</td>
                  <td style={{ verticalAlign: "middle" }}>
                    <span style={{ 
                      padding: "0.15rem 0.4rem", 
                      borderRadius: "4px", 
                      fontSize: "0.75rem",
                      backgroundColor: req.actionType === "Updating" ? "var(--primary-light)" : "var(--border)",
                      color: req.actionType === "Updating" ? "var(--primary-dark)" : "var(--muted)",
                      display: "inline-block"
                    }}>
                      {req.actionType}
                    </span>
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    {req.status === "FILED" ? (
                      <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: "0.25rem", width: "fit-content" }} title={req.matrixTicketId || ""}>
                        <CheckCircle size={14} /> Filed
                      </span>
                    ) : req.status === "PENDING" ? (
                      <span style={{ color: "var(--warning)", display: "flex", alignItems: "center", gap: "0.25rem", width: "fit-content" }}>
                        <Clock size={14} /> Pending
                      </span>
                    ) : (
                      <span style={{ color: "var(--danger)", display: "flex", alignItems: "center", gap: "0.25rem", width: "fit-content" }}>
                        <XCircle size={14} /> Error
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                        {req.status !== "FILED" && (
                          <button 
                            onClick={() => openModal(req)}
                            className="btn btn-primary"
                            style={{ minHeight: "32px", padding: "4px 12px", fontSize: "13px" }}
                          >
                            File to Matrix
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(req.id)}
                          title="Delete request"
                          style={{ 
                            background: "none", border: "none", cursor: "pointer", 
                            color: "var(--danger)", opacity: 0.7, padding: "4px",
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}
                          onMouseOver={(e) => e.currentTarget.style.opacity = "1"}
                          onMouseOut={(e) => e.currentTarget.style.opacity = "0.7"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* File to Matrix Modal */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "8px", width: "100%", maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>New issue</h2>
              <button onClick={closeModal} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
              <form id="matrix-file-form" onSubmit={handleFileToMatrix} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right" }}>Tracker <span style={{ color: "var(--danger)" }}>*</span></label>
                  <select className="select" style={{ minWidth: "200px" }} value={trackerId} onChange={e => setTrackerId(Number(e.target.value) || "")} required>
                    {trackersList.length === 0 && <option value="">Loading...</option>}
                    {trackersList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px" }}>Subject <span style={{ color: "var(--danger)" }}>*</span></label>
                  <input className="input" style={{ flex: 1 }} value={subject} onChange={e => setSubject(e.target.value)} required />
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <label style={{ width: "120px", fontSize: "13px", fontWeight: 500, textAlign: "right", marginTop: "8px" }}>Description</label>
                  <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "4px" }}>
                    <div style={{ padding: "6px", borderBottom: "1px solid var(--border)", background: "#f8fafc", fontSize: "12px", display: "flex", gap: "8px" }}>
                       <span style={{ fontWeight: 600, color: "var(--accent)" }}>Edit</span>
                       <span style={{ color: "var(--muted)" }}>Preview</span>
                    </div>
                    <textarea className="input" style={{ width: "100%", border: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0, resize: "vertical" }} rows={10} value={description} onChange={e => setDescription(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "8px", marginLeft: "128px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <label style={{ width: "80px", fontSize: "13px" }}>Status <span style={{ color: "var(--danger)" }}>*</span></label>
                       <select className="select" style={{ flex: 1 }} value={statusId} onChange={e => setStatusId(Number(e.target.value))} required>
                         <option value={1}>New</option>
                         <option value={2}>In Progress</option>
                         <option value={3}>Resolved</option>
                       </select>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <label style={{ width: "80px", fontSize: "13px" }}>Priority <span style={{ color: "var(--danger)" }}>*</span></label>
                       <select className="select" style={{ flex: 1 }} value={priorityId} onChange={e => setPriorityId(Number(e.target.value))} required>
                         <option value={2}>Normal</option>
                         <option value={3}>High</option>
                         <option value={4}>Urgent</option>
                       </select>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <label style={{ width: "80px", fontSize: "13px" }}>Assignee <span style={{ color: "var(--danger)" }}>*</span></label>
                       <select className="select" style={{ flex: 1 }} value={assigneeId} onChange={e => setAssigneeId(Number(e.target.value) || "")} required>
                         <option value="">&lt;&lt; me &gt;&gt;</option>
                         {assigneesList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                       </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <label style={{ width: "80px", fontSize: "13px" }}>Category <span style={{ color: "var(--danger)" }}>*</span></label>
                       <select className="select" style={{ flex: 1 }} value={categoryId} onChange={handleCategoryChange} required>
                         <option value=""></option>
                         {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                       </select>
                    </div>

                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <label style={{ width: "80px", fontSize: "13px" }}>Start date</label>
                      <input type="date" className="input" style={{ flex: 1 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <label style={{ width: "80px", fontSize: "13px" }}>Due date</label>
                      <input type="date" className="input" style={{ flex: 1 }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>

                  </div>
                </div>

              </form>
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px", background: "#f8fafc", borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px" }}>
              <button type="submit" form="matrix-file-form" className="btn btn-primary" disabled={submitting}>
                {submitting ? <RefreshCw size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
                Create
              </button>
              <button type="button" className="btn" onClick={closeModal} disabled={submitting}>Cancel</button>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}} />
          </div>
        </div>
      )}
      {/* Success Modal */}
      {successMessage && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "400px", padding: "32px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <CheckCircle size={32} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>Success!</h2>
            <p style={{ fontSize: "15px", color: "var(--muted)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
              {successMessage}
            </p>
            <button 
              onClick={() => setSuccessMessage("")}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", minHeight: "44px", fontSize: "15px" }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </>
  );
}
