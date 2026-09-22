"use client";

import { useState, useEffect } from "react";
import { Edit2, Save, X, RefreshCw, CheckCircle, XCircle } from "lucide-react";

export default function AccountPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  
  const fetchMyRequests = async () => {
    try {
      const res = await fetch("/api/filing?scope=me");
      const data = await res.json();
      if (res.ok) {
        setRequests(data);
      } else {
        setError(data.error || "Failed to load requests");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const handleEditClick = (req: any) => {
    if (req.status !== "PENDING") return;
    setEditingId(req.id);
    setEditForm({
      actionType: req.actionType,
      remarks: req.remarks,
      firstName: req.firstName || "",
      middleName: req.middleName || "",
      lastName: req.lastName || "",
      sex: req.sex || "",
      birthday: req.birthday ? req.birthday.split("T")[0] : ""
    });
  };

  const handleSaveEdit = async () => {
    try {
      const res = await fetch("/api/filing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editForm })
      });
      const data = await res.json();
      if (res.ok) {
        setEditingId(null);
        fetchMyRequests();
        setSuccessMessage("Request updated successfully!");
      } else {
        setErrorMessage(data.error || "Failed to update");
      }
    } catch (err) {
      setErrorMessage("Error saving request");
    }
  };

  if (loading) return <div>Loading account...</div>;

  const pendingCount = requests.filter(r => r.status === "PENDING").length;
  const filedCount = requests.filter(r => r.status === "FILED").length;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>My Account</h1>
        <p className="muted">View your personal filing history and manage your requests.</p>
      </header>

      {error && <div style={{ color: "var(--danger)", background: "var(--danger-light, #ffebe9)", padding: "1rem", borderRadius: "8px", marginBottom: "1rem" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--accent)" }}>{pendingCount}</div>
          <div className="muted" style={{ fontWeight: "500" }}>Pending Filing</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#16a34a" }}>{filedCount}</div>
          <div className="muted" style={{ fontWeight: "500" }}>Filed Tickets</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{requests.length}</div>
          <div className="muted" style={{ fontWeight: "500" }}>Total Requests</div>
        </div>
      </div>

      <section style={{ background: "var(--surface)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)", overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600" }}>My Filing Requests</h2>
          <button onClick={fetchMyRequests} className="btn btn-secondary" style={{ padding: "0.5rem" }}><RefreshCw size={16} /></button>
        </div>

        {requests.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>You have not filed any requests yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", minWidth: "800px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.75rem 0.5rem" }}>TRN</th>
                <th style={{ padding: "0.75rem 0.5rem" }}>Action</th>
                <th style={{ padding: "0.75rem 0.5rem" }}>Name</th>
                <th style={{ padding: "0.75rem 0.5rem" }}>Remarks</th>
                <th style={{ padding: "0.75rem 0.5rem" }}>Status</th>
                <th style={{ padding: "0.75rem 0.5rem" }}>Date</th>
                <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => {
                const isEditing = editingId === req.id;
                
                return (
                  <tr key={req.id} style={{ borderBottom: "1px solid var(--border)", background: isEditing ? "rgba(0,0,0,0.02)" : "transparent" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: "500", fontFamily: "monospace" }}>{req.trn}</td>
                    
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      {isEditing ? (
                        <select className="input" style={{ width: "100%", padding: "4px" }} value={editForm.actionType} onChange={e => setEditForm({...editForm, actionType: e.target.value})}>
                          <option>Updating</option>
                          <option>Not Updating</option>
                        </select>
                      ) : req.actionType}
                    </td>

                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <input className="input" style={{ padding: "4px" }} placeholder="First" value={editForm.firstName} onChange={e => setEditForm({...editForm, firstName: e.target.value})} />
                          <input className="input" style={{ padding: "4px" }} placeholder="Last" value={editForm.lastName} onChange={e => setEditForm({...editForm, lastName: e.target.value})} />
                        </div>
                      ) : (
                        <>{req.firstName} {req.lastName}</>
                      )}
                    </td>

                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      {isEditing ? (
                        <input className="input" style={{ width: "100%", padding: "4px" }} value={editForm.remarks} onChange={e => setEditForm({...editForm, remarks: e.target.value})} />
                      ) : req.remarks}
                    </td>

                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span style={{ 
                        padding: "2px 6px", borderRadius: "4px", fontSize: "0.8rem", 
                        background: req.status === "PENDING" ? "#fffbeb" : "#f0fdf4",
                        color: req.status === "PENDING" ? "#b45309" : "#16a34a"
                      }}>
                        {req.status}
                      </span>
                    </td>

                    <td style={{ padding: "0.75rem 0.5rem", color: "var(--muted)" }}>
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>

                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      {req.status === "PENDING" && (
                        isEditing ? (
                          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                            <button onClick={handleSaveEdit} className="btn btn-primary" style={{ padding: "0.25rem 0.5rem" }}><Save size={14} /></button>
                            <button onClick={() => setEditingId(null)} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem" }}><X size={14} /></button>
                          </div>
                        ) : (
                          <button onClick={() => handleEditClick(req)} className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                            <Edit2 size={14} style={{ marginRight: "0.25rem" }} /> Edit
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

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

      {/* Error Modal */}
      {errorMessage && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "400px", padding: "32px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--danger-light, #fee2e2)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <XCircle size={32} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>Oops!</h2>
            <p style={{ fontSize: "15px", color: "var(--muted)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
              {errorMessage}
            </p>
            <button 
              onClick={() => setErrorMessage("")}
              className="btn"
              style={{ width: "100%", justifyContent: "center", minHeight: "44px", fontSize: "15px", border: "1px solid var(--border)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
