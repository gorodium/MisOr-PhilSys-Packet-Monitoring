"use client";

import { useState } from "react";
import { Send, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

export function FilingClient() {
  const [trn, setTrn] = useState("");
  const [actionType, setActionType] = useState("Updating");
  const [issueType, setIssueType] = useState("");
  const [customIssue, setCustomIssue] = useState("");
  
  // Optional fields
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState("");
  const [birthday, setBirthday] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const rawTrnCount = trn.replace(/\D/g, "").length;
  const isTrnValid = rawTrnCount === 29;
  const hasStartedTypingTrn = trn.length > 0;

  const [successModal, setSuccessModal] = useState({ show: false, message: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isTrnValid) {
      setMessage({ type: "error", text: "TRN must be exactly 29 digits." });
      return;
    }
    
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch("/api/filing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trn: trn.replace(/\D/g, ""),
          actionType,
          remarks: issueType === "Others" ? customIssue : issueType,
          firstName: firstName || null,
          middleName: middleName || null,
          lastName: lastName || null,
          sex: sex || null,
          birthday: birthday || null
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to submit request.");

      setSuccessModal({ 
        show: true, 
        message: "Filing request successfully queued! It is now pending for manual Matrix ticket creation by an admin." 
      });
      
      // Clear form
      clearForm();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Submission failed" });
    } finally {
      setLoading(false);
    }
  }

  function clearForm() {
    setTrn("");
    setIssueType("");
    setCustomIssue("");
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setSex("");
    setBirthday("");
    setMessage({ type: "", text: "" });
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <header className="page-header" style={{ marginBottom: "24px", display: "block" }}>
        <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "8px" }}>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>Dashboard</Link>
          <span style={{ margin: "0 8px" }}>/</span>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>Matrix Filing</span>
        </div>
        <h1 className="page-title" style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)" }}>Request for Matrix Filing</h1>
        <p className="page-kicker" style={{ fontSize: "15px", marginTop: "6px" }}>Submit a packet to queue it for manual Matrix ticket creation by an admin.</p>
      </header>

      <section className="panel" style={{ padding: "32px", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          
          {message.text && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: message.type === "error" ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${message.type === "error" ? "#fecaca" : "#bbf7d0"}`,
              color: message.type === "error" ? "#991b1b" : "#166534"
            }}>
              {message.type === "error" ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              <span style={{ fontWeight: 500 }}>{message.text}</span>
            </div>
          )}

          {/* Section 1: Request Details */}
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 16px 0", color: "var(--text)", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
              Request Details
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              
              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="field-label" htmlFor="trn">
                  Transaction Reference Number (TRN) <span style={{ color: "var(--danger)", marginLeft: "2px" }} aria-label="required">*</span>
                </label>
                <input
                  id="trn"
                  type="text"
                  className="input"
                  style={{ minHeight: "44px", fontSize: "15px" }}
                  placeholder="e.g. 75100222210707220210929090006"
                  value={trn}
                  onChange={(e) => setTrn(e.target.value)}
                  aria-invalid={hasStartedTypingTrn && !isTrnValid ? "true" : "false"}
                  required
                />
                <div style={{ fontSize: "13px", color: hasStartedTypingTrn && !isTrnValid ? "var(--danger)" : "var(--muted)", minHeight: "18px" }}>
                  {hasStartedTypingTrn && !isTrnValid 
                    ? `TRN must be exactly 29 digits. (Current: ${rawTrnCount})` 
                    : "Enter the exact 29-digit TRN packet."}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                
                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label className="field-label" htmlFor="actionType">
                    Tracker <span style={{ color: "var(--danger)", marginLeft: "2px" }} aria-label="required">*</span>
                  </label>
                  <select
                    id="actionType"
                    className="select"
                    style={{ minHeight: "44px", fontSize: "15px" }}
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    required
                  >
                    <option value="Updating">Updating</option>
                    <option value="Not Updating">Not Updating</option>
                  </select>
                </div>
                
                <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label className="field-label" htmlFor="issueType">
                    TRN issue/s <span style={{ color: "var(--danger)", marginLeft: "2px" }} aria-label="required">*</span>
                  </label>
                  <select
                    id="issueType"
                    className="select"
                    style={{ minHeight: "44px", fontSize: "15px" }}
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select issue type</option>
                    <option value="Unclickable">Unclickable</option>
                    <option value="Still in progress">Still in progress</option>
                    <option value="Failed Registration">Failed Registration</option>
                    <option value="No Photo/QR">No Photo/QR</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                {issueType === "Others" && (
                  <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label className="field-label" htmlFor="customIssue">
                      Specify Issue <span style={{ color: "var(--danger)", marginLeft: "2px" }} aria-label="required">*</span>
                    </label>
                    <textarea
                      id="customIssue"
                      className="input"
                      style={{ minHeight: "44px", fontSize: "15px", resize: "vertical" }}
                      placeholder="Describe the technical problem"
                      value={customIssue}
                      onChange={(e) => setCustomIssue(e.target.value)}
                      required
                      rows={3}
                    />
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Section 2: Applicant Information */}
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 4px 0", color: "var(--text)", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
              Applicant Information
            </h2>
            <p style={{ fontSize: "13px", color: "var(--muted)", margin: "8px 0 20px 0" }}>
              These details will be retrieved automatically from the tracking system when available. Enter them manually only when needed.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="field-label" htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  className="input"
                  style={{ minHeight: "44px" }}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              
              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="field-label" htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  className="input"
                  style={{ minHeight: "44px" }}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              
              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="field-label" htmlFor="middleName">Middle Name</label>
                <input
                  id="middleName"
                  type="text"
                  className="input"
                  style={{ minHeight: "44px" }}
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="field-label" htmlFor="sex">Sex</label>
                <select
                  id="sex"
                  className="select"
                  style={{ minHeight: "44px" }}
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="form-group" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label className="field-label" htmlFor="birthday">Birthday</label>
                <input
                  id="birthday"
                  type="date"
                  className="input"
                  style={{ minHeight: "44px" }}
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
              </div>
            </div>
          </div>

          <hr style={{ margin: "0", borderColor: "var(--border)" }} />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={clearForm}
              className="btn"
              style={{ minHeight: "44px", padding: "0 24px" }}
              disabled={loading}
            >
              Clear Form
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minHeight: "44px", padding: "0 24px", minWidth: "200px" }}
              disabled={loading || !isTrnValid}
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Submit Filing Request
                </>
              )}
            </button>
          </div>
          
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin { 100% { transform: rotate(360deg); } }
            @media (max-width: 600px) {
              .btn { width: 100%; justify-content: center; }
            }
          `}} />
        </form>
      </section>
      {successModal.show && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "400px", padding: "32px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <CheckCircle2 size={32} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>Success!</h2>
            <p style={{ fontSize: "15px", color: "var(--muted)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
              {successModal.message}
            </p>
            <button 
              onClick={() => setSuccessModal({ show: false, message: "" })}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", minHeight: "44px", fontSize: "15px" }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
