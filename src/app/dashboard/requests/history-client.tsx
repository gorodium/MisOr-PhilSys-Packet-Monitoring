"use client";

import { useState, useEffect } from "react";
import { Clock, CheckCircle, XCircle, Send, X, RefreshCw, Trash2, Edit2, Save, Download } from "lucide-react";
import * as XLSX from "xlsx";

type FilingRequest = {
  id: string;
  trn: string;
  actionType: string;
  remarks: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  sex?: string;
  birthday?: string;
  status: string;
  matrixTicketId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { username: string };
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

  // Edit Modal state
  const [editModalReq, setEditModalReq] = useState<FilingRequest | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRange, setExportRange] = useState("today");
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");

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
    fetchRequests();
    fetchOptions();
  }, []);

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function openEditModal(req: FilingRequest) {
    setEditModalReq(req);
    setEditForm({
      actionType: req.actionType,
      remarks: req.remarks,
      firstName: req.firstName || "",
      middleName: req.middleName || "",
      lastName: req.lastName || "",
      sex: req.sex || "",
      birthday: req.birthday ? new Date(req.birthday).toISOString().split("T")[0] : ""
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editModalReq) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/filing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editModalReq.id, ...editForm })
      });
      const data = await res.json();
      if (res.ok) {
        setEditModalReq(null);
        fetchRequests();
        setSuccessMessage("Request updated successfully!");
      } else {
        setErrorMessage(data.error || "Failed to update request");
      }
    } catch (err) {
      setErrorMessage("Error saving request");
    } finally {
      setSavingEdit(false);
    }
  }

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

    // Apply default assignee and category based on remarks
    let initialAssigneeId: number | "" = "";
    let initialCategory = "";

    const lowerRemarks = req.remarks ? req.remarks.toLowerCase() : "";

    if (lowerRemarks.includes("unclickable")) {
      initialCategory = "With PSN";
      const aaron = assigneesList.find(a => a.name.toLowerCase().includes("aaron"));
      if (aaron) initialAssigneeId = aaron.id;
    } else if (lowerRemarks.includes("still in progress")) {
      initialCategory = "NO PSN";
      const joshua = assigneesList.find(a => a.name.toLowerCase().includes("joshua"));
      if (joshua) initialAssigneeId = joshua.id;
    } else if (lowerRemarks.includes("no photo") || lowerRemarks.includes("no qr")) {
      const aaron = assigneesList.find(a => a.name.toLowerCase().includes("aaron"));
      if (aaron) initialAssigneeId = aaron.id;
    }

    setAssigneeId(initialAssigneeId);
    setCategoryId(initialCategory as any);
    
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

  const [batchFiling, setBatchFiling] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchConfirmRequests, setBatchConfirmRequests] = useState<FilingRequest[] | null>(null);

  function handleBatchFileUnclickable() {
    const unclickableRequests = requests.filter(req => req.status === "PENDING" && (req.remarks || "").toLowerCase().includes("unclickable"));
    
    if (unclickableRequests.length === 0) {
      setErrorMessage("No pending requests found with 'Unclickable' remarks.");
      return;
    }
    
    setBatchConfirmRequests(unclickableRequests);
  }

  async function executeBatchFile() {
    const unclickableRequests = batchConfirmRequests;
    if (!unclickableRequests) return;
    
    setBatchConfirmRequests(null);
    setBatchProgress({ current: 0, total: unclickableRequests.length });
    setBatchFiling(true);
    let successCount = 0;
    
    for (const req of unclickableRequests) {
      const defaultTrackerName = req.actionType === "Updating" ? "Updating Concerns" : "ePhilID TRN Concerns";
      const foundTracker = trackersList.find(t => t.name === defaultTrackerName);
      const reqTrackerId = foundTracker ? foundTracker.id : (trackersList[0]?.id || "");
      
      const reqSubject = `ePhilID TRN Concerns - Misamis Oriental`;
      const reqDescription = `TRN: ${req.trn}\n\nDescribe the TRN issue/s: ${req.remarks}`;
      
      const reqStatusId = 1;
      const reqPriorityId = 2;
      
      const aaron = assigneesList.find(a => a.name.toLowerCase().includes("aaron"));
      const reqAssigneeId = aaron ? aaron.id : undefined;
      const reqCategoryName = "With PSN";
      
      const today = new Date();
      const reqStartDate = formatDate(today);
      const reqDueDate = formatDate(getNextWorkday(today));
      
      try {
        const res = await fetch(`/api/filing/${req.id}/matrix`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackerId: reqTrackerId || undefined,
            title: reqSubject,
            body: reqDescription,
            statusId: reqStatusId,
            priorityId: reqPriorityId,
            assigneeId: reqAssigneeId,
            categoryName: reqCategoryName,
            startDate: reqStartDate,
            dueDate: reqDueDate,
          })
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error("Batch file error for req:", req.id, e);
      }
      setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }
    
    setBatchFiling(false);
    fetchRequests();
    setSuccessMessage(`Batch filing complete! Successfully filed ${successCount} out of ${unclickableRequests.length} requests.`);
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
        setErrorMessage(errData.error || "Failed to file to Matrix");
      }
    } catch (e) {
      setErrorMessage("Submission failed. Check network connection.");
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
        setSuccessMessage("Request deleted successfully!");
      } else {
        const data = await res.json();
        setErrorMessage(data.error || "Failed to delete request.");
      }
    } catch (e) {
      setErrorMessage("An error occurred while deleting.");
    }
  }

  function handleExportCSV(e: React.FormEvent) {
    e.preventDefault();
    let filtered = requests;
    const now = new Date();
    
    if (exportRange === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = requests.filter(r => new Date(r.createdAt) >= today);
    } else if (exportRange === "week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0,0,0,0);
      filtered = requests.filter(r => new Date(r.createdAt) >= startOfWeek);
    } else if (exportRange === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = requests.filter(r => new Date(r.createdAt) >= startOfMonth);
    } else if (exportRange === "custom" && exportStart && exportEnd) {
      const start = new Date(exportStart);
      start.setHours(0,0,0,0);
      const end = new Date(exportEnd);
      end.setHours(23,59,59,999);
      filtered = requests.filter(r => {
        const d = new Date(r.createdAt);
        return d >= start && d <= end;
      });
    }

    const headers = ["Date Filed", "TRN", "Tracker", "Remarks", "First Name", "Last Name", "Filer (Username)", "Status"];
    const rows = filtered.map(r => [
      new Date(r.createdAt).toLocaleString(),
      r.trn || "", // no need for tab hack, xlsx will handle it if we set it as string
      r.actionType || "",
      r.remarks || "",
      r.firstName || "",
      r.lastName || "",
      r.user?.username || "",
      r.status || ""
    ]);
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    
    // Auto size columns
    const colWidths = headers.map((header, i) => {
      const maxWidth = rows.reduce((max, row) => Math.max(max, String(row[i] || "").length), header.length);
      return { wch: Math.min(maxWidth + 2, 50) }; // cap width at 50 chars
    });
    ws["!cols"] = colWidths;
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Requests");
    
    // Download
    XLSX.writeFile(wb, `TRN_Export_${exportRange}_${new Date().toISOString().split("T")[0]}.xlsx`);
    setIsExportModalOpen(false);
  }

  const [activeTab, setActiveTab] = useState<"pending" | "filed">("pending");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [filerFilter, setFilerFilter] = useState("");

  const pendingRequests = requests.filter(r => r.status !== "FILED");
  const filedRequests = requests.filter(r => r.status === "FILED");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  let filedToday = 0;
  let filedWeek = 0;
  let filedMonth = 0;

  filedRequests.forEach(req => {
    const d = new Date(req.updatedAt);
    if (d >= today) filedToday++;
    if (d >= startOfWeek) filedWeek++;
    if (d >= startOfMonth) filedMonth++;
  });

  let displayRequests = activeTab === "pending" ? pendingRequests : filedRequests;
  
  if (searchQuery) {
    const lowerQ = searchQuery.toLowerCase();
    displayRequests = displayRequests.filter(r => 
      (r.trn && r.trn.toLowerCase().includes(lowerQ)) || 
      (r.remarks && r.remarks.toLowerCase().includes(lowerQ)) ||
      (r.firstName && r.firstName.toLowerCase().includes(lowerQ)) ||
      (r.lastName && r.lastName.toLowerCase().includes(lowerQ))
    );
  }

  if (filerFilter) {
    displayRequests = displayRequests.filter(r => (r.user?.username || "Unknown") === filerFilter);
  }

  const uniqueFilers = Array.from(new Set(requests.map(r => r.user?.username || "Unknown"))).sort();

  const sortedDisplayRequests = [...displayRequests].sort((a, b) => {
    const dateA = new Date(activeTab === "filed" ? a.updatedAt : a.createdAt).getTime();
    const dateB = new Date(activeTab === "filed" ? b.updatedAt : b.createdAt).getTime();
    return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });

  return (
    <>
      <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Filing History</h1>
          <p className="page-kicker">Review past Matrix Filing requests</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {batchFiling ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px", justifyContent: "center", background: "var(--surface)", padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", justifyContent: "space-between", fontWeight: 500 }}>
                <span>Filing requests...</span>
                <span>{batchProgress.current} / {batchProgress.total}</span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ 
                  height: "100%", 
                  background: "var(--primary)", 
                  width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                  transition: "width 0.3s ease" 
                }} />
              </div>
            </div>
          ) : (
            <button 
              onClick={handleBatchFileUnclickable}
              className="btn btn-primary"
              style={{ display: "flex", gap: "8px", alignItems: "center" }}
              title="Automatically file all pending requests marked as Unclickable"
            >
              File All Unclickable
            </button>
          )}
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="btn btn-secondary"
            style={{ display: "flex", gap: "8px", alignItems: "center" }}
          >
            <Download size={16} /> Export Excel
          </button>
        </div>
      </header>

      <section aria-label="Filing stats" style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
        <div className="kpi-card" style={{ flex: "1 1 0", minWidth: "200px", maxWidth: "250px" }}>
          <div className="kpi-label">Filed Today</div>
          <div className="kpi-value">{filedToday}</div>
        </div>
        <div className="kpi-card" style={{ flex: "1 1 0", minWidth: "200px", maxWidth: "250px" }}>
          <div className="kpi-label">Filed This Week</div>
          <div className="kpi-value">{filedWeek}</div>
        </div>
        <div className="kpi-card" style={{ flex: "1 1 0", minWidth: "200px", maxWidth: "250px" }}>
          <div className="kpi-label">Filed This Month</div>
          <div className="kpi-value">{filedMonth}</div>
        </div>
        <div className="kpi-card" style={{ flex: "1 1 0", minWidth: "200px", maxWidth: "250px" }}>
          <div className="kpi-label">Filed Overall</div>
          <div className="kpi-value">{filedRequests.length}</div>
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "16px" }}>
          <button 
            onClick={() => setActiveTab("pending")}
            style={{ 
              background: "none", border: "none", cursor: "pointer", 
              padding: "8px 16px", fontSize: "14px", fontWeight: 500,
              borderBottom: activeTab === "pending" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "pending" ? "var(--primary-dark)" : "var(--muted)"
            }}
          >
            Pending ({pendingRequests.length})
          </button>
          <button 
            onClick={() => setActiveTab("filed")}
            style={{ 
              background: "none", border: "none", cursor: "pointer", 
              padding: "8px 16px", fontSize: "14px", fontWeight: 500,
              borderBottom: activeTab === "filed" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "filed" ? "var(--primary-dark)" : "var(--muted)"
            }}
          >
            Filed ({filedRequests.length})
          </button>
        </div>
        <div style={{ display: "flex", gap: "12px", paddingBottom: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <input 
            type="text" 
            className="input" 
            placeholder="Search TRN, name, remarks..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: "13px", padding: "4px 8px", minHeight: "unset", width: "200px" }}
          />
          <select 
            className="select" 
            value={filerFilter} 
            onChange={(e) => setFilerFilter(e.target.value)}
            style={{ fontSize: "13px", padding: "4px 8px", minHeight: "unset" }}
          >
            <option value="">All Filers</option>
            {uniqueFilers.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select 
            className="select" 
            value={sortOrder} 
            onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
            style={{ fontSize: "13px", padding: "4px 8px", minHeight: "unset" }}
          >
            <option value="desc">Newest to Oldest</option>
            <option value="asc">Oldest to Newest</option>
          </select>
        </div>
      </div>

      <section className="panel" style={{ overflowX: "auto" }}>
        {loadingRequests ? (
          <p className="muted" style={{ padding: "20px" }}>Loading requests...</p>
        ) : displayRequests.length === 0 ? (
          <p className="muted" style={{ padding: "20px" }}>No {activeTab} requests.</p>
        ) : (
          <table className="data-table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--muted)" }}>
                <th>Date</th>
                <th style={{ textAlign: "center" }}>Filed By</th>
                <th style={{ paddingRight: "3rem" }}>TRN</th>
                <th style={{ textAlign: "center", paddingLeft: "3rem" }}>Tracker</th>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplayRequests.map(req => {
                const displayDate = new Date(activeTab === "filed" ? req.updatedAt : req.createdAt);
                return (
                <tr key={req.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>
                  <td style={{ verticalAlign: "middle" }}>{displayDate.toLocaleDateString()} {displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ verticalAlign: "middle", textAlign: "center" }}>{req.user?.username || "Unknown"}</td>
                  <td style={{ fontFamily: "monospace", verticalAlign: "middle", paddingRight: "3rem" }}>{req.trn}</td>
                  <td style={{ verticalAlign: "middle", textAlign: "center", paddingLeft: "3rem" }}>
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
                  <td style={{ verticalAlign: "middle", textAlign: "center" }}>
                    {req.status === "FILED" ? (
                      <span style={{ color: "var(--success)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }} title={req.matrixTicketId || ""}>
                        <CheckCircle size={14} /> Filed
                      </span>
                    ) : req.status === "PENDING" ? (
                      <span style={{ color: "var(--warning)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                        <Clock size={14} /> Pending
                      </span>
                    ) : (
                      <span style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}>
                        <XCircle size={14} /> Error
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center" }}>
                      {(req.status === "PENDING" || isAdmin) && (
                        <button 
                          onClick={() => openEditModal(req)}
                          className="btn btn-secondary"
                          style={{ minHeight: "32px", padding: "4px 12px", fontSize: "13px" }}
                        >
                          <Edit2 size={14} style={{ marginRight: "4px" }} /> Edit
                        </button>
                      )}
                      
                      {isAdmin && req.status !== "FILED" && (
                        <button 
                          onClick={() => openModal(req)}
                          className="btn btn-primary"
                          style={{ minHeight: "32px", padding: "4px 12px", fontSize: "13px" }}
                        >
                          File to Matrix
                        </button>
                      )}
                      
                      {isAdmin && (
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
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
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
      {/* Edit Request Modal */}
      {editModalReq && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "8px", width: "100%", maxWidth: "600px", display: "flex", flexDirection: "column", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Edit Request ({editModalReq.trn})</h2>
              <button onClick={() => setEditModalReq(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: "20px", overflowY: "auto", maxHeight: "70vh" }}>
              <form id="edit-request-form" onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 500 }}>Action Type</label>
                  <select className="select" value={editForm.actionType} onChange={e => setEditForm({...editForm, actionType: e.target.value})} required>
                    <option value="Updating">Updating</option>
                    <option value="Not Updating">Not Updating</option>
                  </select>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>First Name</label>
                    <input className="input" value={editForm.firstName} onChange={e => setEditForm({...editForm, firstName: e.target.value})} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Middle Name</label>
                    <input className="input" value={editForm.middleName} onChange={e => setEditForm({...editForm, middleName: e.target.value})} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Last Name</label>
                    <input className="input" value={editForm.lastName} onChange={e => setEditForm({...editForm, lastName: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Sex</label>
                    <select className="select" value={editForm.sex} onChange={e => setEditForm({...editForm, sex: e.target.value})}>
                      <option value="">N/A</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500 }}>Birthday</label>
                    <input type="date" className="input" value={editForm.birthday} onChange={e => setEditForm({...editForm, birthday: e.target.value})} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 500 }}>Remarks</label>
                  <textarea className="input" rows={3} value={editForm.remarks} onChange={e => setEditForm({...editForm, remarks: e.target.value})} required />
                </div>
              </form>
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px", background: "#f8fafc", borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px" }}>
              <button type="submit" form="edit-request-form" className="btn btn-primary" disabled={savingEdit}>
                {savingEdit ? <RefreshCw size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                Save Changes
              </button>
              <button type="button" className="btn" onClick={() => setEditModalReq(null)} disabled={savingEdit}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "8px", width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Export Filed Requests</h2>
              <button onClick={() => setIsExportModalOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: "20px" }}>
              <form id="export-form" onSubmit={handleExportCSV} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 500 }}>Date Range</label>
                  <select className="select" value={exportRange} onChange={e => setExportRange(e.target.value)} required>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="all">All Time</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                
                {exportRange === "custom" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 500 }}>Start Date</label>
                      <input type="date" className="input" value={exportStart} onChange={e => setExportStart(e.target.value)} required />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 500 }}>End Date</label>
                      <input type="date" className="input" value={exportEnd} onChange={e => setExportEnd(e.target.value)} required />
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px", background: "#f8fafc", borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px" }}>
              <button type="submit" form="export-form" className="btn btn-primary" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Download size={14} /> Download Excel
              </button>
              <button type="button" className="btn" onClick={() => setIsExportModalOpen(false)}>Cancel</button>
            </div>
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

      {/* Batch Filing Confirm Modal */}
      {batchConfirmRequests && (
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
                onClick={() => setBatchConfirmRequests(null)}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: "44px", fontSize: "15px" }}
              >
                Cancel
              </button>
              <button 
                onClick={executeBatchFile}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: "44px", fontSize: "15px" }}
              >
                Yes, file them
              </button>
            </div>
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
    </>
  );
}
