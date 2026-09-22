const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/app/dashboard/requests/history-client.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const [batchConfirmRequests, setBatchConfirmRequests] = useState<FilingRequest[] | null>(null);',
  'const [batchConfirm, setBatchConfirm] = useState<{ type: string, requests: FilingRequest[] } | null>(null);'
);

content = content.replace(
  `  function handleBatchFileUnclickable() {
    const unclickableRequests = requests.filter(req => req.status === "PENDING" && (req.remarks || "").toLowerCase().includes("unclickable"));
    
    if (unclickableRequests.length === 0) {
      setErrorMessage("No pending requests found with 'Unclickable' remarks.");
      return;
    }
    
    setBatchConfirmRequests(unclickableRequests);
  }`,
  `  function handleBatchFileUnclickable() {
    const unclickableRequests = requests.filter(req => req.status === "PENDING" && (req.remarks || "").toLowerCase().includes("unclickable"));
    if (unclickableRequests.length === 0) {
      setErrorMessage("No pending requests found with 'Unclickable' remarks.");
      return;
    }
    setBatchConfirm({ type: "Unclickable", requests: unclickableRequests });
  }

  function handleBatchFileStillInProgress() {
    const sipRequests = requests.filter(req => req.status === "PENDING" && (req.remarks || "").toLowerCase().includes("still in progress"));
    if (sipRequests.length === 0) {
      setErrorMessage("No pending requests found with 'Still In Progress' remarks.");
      return;
    }
    setBatchConfirm({ type: "Still in Progress", requests: sipRequests });
  }`
);

content = content.replace(
  `  async function executeBatchFile() {
    const unclickableRequests = batchConfirmRequests;
    if (!unclickableRequests) return;
    
    setBatchConfirmRequests(null);
    setBatchProgress({ current: 0, total: unclickableRequests.length });`,
  `  async function executeBatchFile() {
    const unclickableRequests = batchConfirm?.requests;
    if (!unclickableRequests) return;
    
    setBatchConfirm(null);
    setBatchProgress({ current: 0, total: unclickableRequests.length });`
);

content = content.replace(
  `            ) : (
              <button 
                onClick={handleBatchFileUnclickable}
                className="btn btn-primary"
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
                title="Automatically file all pending requests marked as Unclickable"
              >
                File All Unclickable
              </button>
            )}`,
  `            ) : (
              <>
                <button 
                  onClick={handleBatchFileUnclickable}
                  className="btn btn-primary"
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                  title="Automatically file all pending requests marked as Unclickable"
                >
                  File All Unclickable
                </button>
                <button 
                  onClick={handleBatchFileStillInProgress}
                  className="btn btn-primary"
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                  title="Automatically file all pending requests marked as Still in Progress"
                >
                  File All Still In Progress
                </button>
              </>
            )}`
);

content = content.replace(
  `      {batchConfirmRequests && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(2px)" }}>
          <div style={{ background: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "450px", padding: "32px", textAlign: "center", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Download size={32} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>Batch File Unclickable</h2>
            <p style={{ fontSize: "15px", color: "var(--muted)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
              Are you sure you want to auto-file <strong>{batchConfirmRequests.length}</strong> &apos;Unclickable&apos; requests to Matrix?<br/>This process cannot be interrupted.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button 
                onClick={() => setBatchConfirmRequests(null)}`,
  `      {batchConfirm && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(2px)" }}>
          <div style={{ background: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "450px", padding: "32px", textAlign: "center", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Download size={32} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>Batch File {batchConfirm.type}</h2>
            <p style={{ fontSize: "15px", color: "var(--muted)", margin: "0 0 24px 0", lineHeight: 1.5 }}>
              Are you sure you want to auto-file <strong>{batchConfirm.requests.length}</strong> &apos;{batchConfirm.type}&apos; requests to Matrix?<br/>This process cannot be interrupted.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button 
                onClick={() => setBatchConfirm(null)}`
);


fs.writeFileSync(file, content, 'utf8');
console.log("Updated history-client.tsx successfully.");
