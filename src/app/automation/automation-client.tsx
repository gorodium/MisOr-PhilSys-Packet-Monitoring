"use client";

import { HardDriveDownload, RefreshCw, Loader2, CheckCircle, XCircle, MessageSquare, Download } from "lucide-react";
import { useEffect, useState, useCallback, Fragment } from "react";
import * as XLSX from "xlsx";

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
  requiredInitialTrn: string | null;
  restorationNotFound: boolean;
  unrecoverable: boolean;
};

type StepLine = { text: string; type: "info" | "ok" | "error" | "warn" };

type JobState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "success"; steps: StepLine[]; uploadedTo: string; destFolder: string; packetName: string; commentPosted: boolean; alreadyUploaded: boolean; isRestored?: boolean }
  | { phase: "error"; steps: StepLine[]; error: string; unrecoverableTagged?: boolean };

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

// --- Global Store ---
const globalJobs = new Map<string, JobState>();
let globalIsRecoveringAll = false;
let globalIsPostingAll = false;
const globalListeners = new Set<() => void>();

function notifyGlobalListeners() {
  globalListeners.forEach((l) => l());
}

function updateGlobalJobs(key: string, state: JobState) {
  globalJobs.set(key, state);
  notifyGlobalListeners();
}
// --------------------

export function AutomationClient() {
  const [restorePackets, setRestorePackets] = useState<RestorePacket[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [jobs, setJobs] = useState<Map<string, JobState>>(globalJobs);
  const [isRecoveringAll, setIsRecoveringAll] = useState(globalIsRecoveringAll);
  const [isPostingAll, setIsPostingAll] = useState(globalIsPostingAll);
  const [commentingFor, setCommentingFor] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"pending" | "completed" | "not_found" | "unrecoverable">("pending");
  const [filterProvince, setFilterProvince] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "trn_asc" | "trn_desc">("default");
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; onCancel: () => void } | null>(null);

  useEffect(() => {
    const listener = () => {
      setJobs(new Map(globalJobs));
      setIsRecoveringAll(globalIsRecoveringAll);
      setIsPostingAll(globalIsPostingAll);
    };
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

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
          requiredInitialTrn: p.requiredInitialTrn ?? null,
          restorationNotFound: p.restorationNotFound ?? false,
          unrecoverable: p.matrixTags?.includes("unrecoverable") || (p.latestMatrixReply || "").toLowerCase().includes("unrecoverable") || (p.latestMatrixReply || "").toLowerCase().includes("re-registration"),
        });

        const isUnrecoverable = p.matrixTags?.includes("unrecoverable") || (p.latestMatrixReply || "").toLowerCase().includes("unrecoverable") || (p.latestMatrixReply || "").toLowerCase().includes("re-registration");
        
        if (isUnrecoverable) {
          newJobs.set(p.id, {
            phase: "error",
            steps: [{ text: "❌ Marked as Unrecoverable", type: "error" }],
            error: "Packet not found",
            unrecoverableTagged: true,
          });
        } else if (p.restorationUploaded || p.restorationCommented) {
          const trnToUse = p.requiredInitialTrn || p.packetCode;
          newJobs.set(p.id, {
            phase: "success",
            steps: [{ text: "✅ Recovered from previous session", type: "ok" }],
            uploadedTo: `/Misamis Oriental/ePhilID TRN Concerns/${p.ticketNumber}/${trnToUse}.zip`,
            destFolder: `/Misamis Oriental/ePhilID TRN Concerns/${p.ticketNumber}`,
            packetName: `${trnToUse}.zip`,
            alreadyUploaded: true,
            commentPosted: p.restorationCommented === true,
            isRestored: true,
          });
        } else if (p.restorationNotFound) {
          newJobs.set(p.id, {
            phase: "error",
            steps: [{ text: "❌ Packet not found on any NAS.", type: "error" }],
            error: "Packet not found on any NAS.",
          });
        }
      });

      setRestorePackets(packets);
      for (const [k, v] of newJobs) {
        if (!globalJobs.has(k)) globalJobs.set(k, v);
      }
      notifyGlobalListeners();
    } catch {
      // ignore
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void loadRestorePackets(); }, [loadRestorePackets]);

  // ── Recover all pending packets sequentially ──
  
  async function recoverAllPendingPackets() {
    if (isRecoveringAll) return;
    let pendingToRecover = restorePackets.filter(p => {
      const job = jobs.get(p.id);
      return !job || job.phase === "idle";
    });

    pendingToRecover.sort((a, b) => {
      const aIsMisOr = (a.province || "").toLowerCase().includes("misamis oriental") || (a.proLptFolder || "").toLowerCase().includes("misamis oriental");
      const bIsMisOr = (b.province || "").toLowerCase().includes("misamis oriental") || (b.proLptFolder || "").toLowerCase().includes("misamis oriental");
      if (aIsMisOr && !bIsMisOr) return -1;
      if (!aIsMisOr && bIsMisOr) return 1;
      return 0;
    });

    if (pendingToRecover.length === 0) {
      alert("No pending packets to recover in this tab.");
      return;
    }

    setConfirmDialog({
      title: "Confirm Recovery",
      message: `Are you sure you want to recover ${pendingToRecover.length} packets sequentially? This may take some time.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        globalIsRecoveringAll = true;
        notifyGlobalListeners();
        for (const packet of pendingToRecover) {
          // Check if it's still idle (maybe user manually clicked it)
          const currentJob = globalJobs.get(packet.id);
          if (!currentJob || currentJob.phase === "idle") {
            await runRestore(packet);
            // Small delay
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        globalIsRecoveringAll = false;
        notifyGlobalListeners();
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  // ── Recover (search + copy) ──
  
  // Retry all Not Found packets
  async function retryAllNotFoundPackets() {
    if (isRecoveringAll) return;
    
    let notFoundPackets = restorePackets.filter(p => {
      const job = jobs.get(p.id);
      const isUnrecoverable = job?.phase === "error" && job.unrecoverableTagged;
      return job?.phase === "error" && !isUnrecoverable && (job.error?.includes("not found") || p.restorationNotFound);
    });

    if (notFoundPackets.length === 0) {
      alert("No 'Not Found' packets to retry.");
      return;
    }

    setConfirmDialog({
      title: "Confirm Retry All",
      message: `Are you sure you want to retry recovering ${notFoundPackets.length} packets that were not found? This may take some time.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        globalIsRecoveringAll = true;
        notifyGlobalListeners();
        for (const packet of notFoundPackets) {
          await runRestore(packet);
          // Small delay
          await new Promise(r => setTimeout(r, 1000));
        }
        globalIsRecoveringAll = false;
        notifyGlobalListeners();
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  async function runRestore(packet: RestorePacket) {
    if (!packet.ticketId || !packet.ticketNumber) return;
    const key = packet.id;

    updateGlobalJobs(key, { phase: "searching" });

    const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per packet
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          packetId: packet.id,
          trn: packet.requiredInitialTrn || packet.packetCode,
          ticketId: packet.ticketId,
          ticketNumber: packet.ticketNumber,
          proLptFolder: packet.proLptFolder || undefined,
          province: packet.province || undefined,
        }),
      });
      clearTimeout(timeoutId);
      const payload = await res.json();
      const steps: StepLine[] = (payload.steps || []).map((s: string) => ({
        text: s,
        type: classifyStep(s),
      }));

      if (payload.success) {
        updateGlobalJobs(key, {
          phase: "success",
          steps,
          uploadedTo: payload.uploadedTo ?? "",
          destFolder: payload.destFolder ?? "",
          packetName: payload.packetName ?? "",
          alreadyUploaded: payload.alreadyUploaded ?? false,
          commentPosted: false,
        });
      } else {
        updateGlobalJobs(key, {
          phase: "error",
          steps: steps.length > 0 ? steps : [{ text: `❌ ${payload.error || "Unknown error"}`, type: "error" }],
          error: payload.error || "Unknown error",
        });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err?.name === "AbortError";
      const msg = isTimeout
        ? "Search timed out after 3 minutes. The NAS may be slow or the packet is in an unexpected folder. Click Recover to retry."
        : err?.message;
      updateGlobalJobs(key, {
        phase: "error",
        steps: [{ text: `❌ ${msg}`, type: "error" }],
        error: msg,
      });
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

      const existing = globalJobs.get(key);
      if (existing?.phase === "success") {
        updateGlobalJobs(key, { ...existing, commentPosted: true });
      }
    } catch (err: any) {
      alert(`Failed to post comment: ${err?.message}`);
    } finally {
      setCommentingFor(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  // ── Post all pending comments sequentially ──
  
  async function postAllPendingComments() {
    if (isPostingAll) return;
    const pendingPackets = restorePackets.filter(p => {
      const job = jobs.get(p.id);
      return job?.phase === "success" && !job.commentPosted;
    });

    if (pendingPackets.length === 0) {
      alert("No pending comments to post.");
      return;
    }

    setConfirmDialog({
      title: "Confirm Post All",
      message: `Are you sure you want to post ${pendingPackets.length} comments sequentially?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        globalIsPostingAll = true;
        notifyGlobalListeners();
        for (const packet of pendingPackets) {
          const job = globalJobs.get(packet.id);
          if (job) {
            await postComment(packet, job);
            // Small delay to prevent rate-limiting
            await new Promise(r => setTimeout(r, 800));
          }
        }
        globalIsPostingAll = false;
        notifyGlobalListeners();
      },
      onCancel: () => setConfirmDialog(null)
    });
  }

  // 🚀 Tag unrecoverable manually 🚀
  async function tagUnrecoverable(packet: RestorePacket, job: JobState) {
    if (job.phase !== "error" || !packet.ticketId) return;

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
          comment: `${packet.packetCode}\n\nUnrecoverable/Re-Registration`
        }),
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) {}
        alert(`Failed to tag unrecoverable for ${packet.ticketNumber}: ${errMsg}`);
      } else {
        updateGlobalJobs(key, { ...job, unrecoverableTagged: true });
      }
    } catch (err: any) {
      alert(`Error tagging unrecoverable for ${packet.ticketNumber}: ${err.message}`);
    } finally {
      setCommentingFor(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // 🚀 Reset job for a packet 🚀──
  function exportToExcel(packetsToExport: RestorePacket[]) {
    const data = packetsToExport.map(p => {
      const job = jobs.get(p.id);
      let status = "Pending";
      if (job?.phase === "success") status = job.commentPosted ? "Commented" : "Uploaded";
      else if (job?.phase === "error") status = job.unrecoverableTagged ? "Unrecoverable" : "Packet Not Found";
      
      return [
        p.packetCode,
        p.requiredInitialTrn ? p.requiredInitialTrn : p.packetCode,
        p.ticketNumber,
        p.province,
        p.proLptFolder,
        status,
        p.latestMatrixReply || ""
      ];
    });
    
    const ws = XLSX.utils.aoa_to_sheet([
      ["TRN", "Original TRN", "Ticket", "Province", "PRO/LPT", "Status", "Latest Reply"],
      ...data
    ]);
    
    const cols = [
      { wch: 30 },
      { wch: 30 },
      { wch: 10 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 80 },
    ];
    ws["!cols"] = cols;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Backend Restoration");
    XLSX.writeFile(wb, `Backend_Restoration_Packets_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function resetJob(key: string) {
    globalJobs.delete(key);
    notifyGlobalListeners();
  }

  const completedPacketsCount = restorePackets.filter(p => {
    const job = jobs.get(p.id);
    return job?.phase === "success" && job.commentPosted === true;
  }).length;
  
  const unrecoverablePacketsCount = restorePackets.filter(p => {
    const job = jobs.get(p.id);
    return job?.phase === "error" && job.unrecoverableTagged;
  }).length;
  
  const notFoundPacketsCount = restorePackets.filter(p => {
    const job = jobs.get(p.id);
    return job?.phase === "error" && !job.unrecoverableTagged && (job.error?.includes("not found") || p.restorationNotFound);
  }).length;

  const pendingPacketsCount = restorePackets.length - completedPacketsCount - notFoundPacketsCount - unrecoverablePacketsCount;

  const pendingToRecoverCount = restorePackets.filter(p => {
    const job = jobs.get(p.id);
    return !job || job.phase === "idle";
  }).length;
  
  const pendingToPostCount = restorePackets.filter(p => {
    const job = jobs.get(p.id);
    return job?.phase === "success" && !job.commentPosted;
  }).length;

  const uniqueProvinces = Array.from(new Set(restorePackets.map(p => p.province).filter(Boolean))).sort();

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  const displayPackets = restorePackets.filter(p => {
    const job = jobs.get(p.id);
    const isCompleted = job?.phase === "success" && job.commentPosted === true;
    const isUnrecoverable = job?.phase === "error" && job.unrecoverableTagged;
    const isNotFound = job?.phase === "error" && !isUnrecoverable && (job.error?.includes("not found") || p.restorationNotFound);
    
    if (filterProvince && p.province !== filterProvince) return false;

    if (activeTab === "completed") return isCompleted;
    if (activeTab === "not_found") return isNotFound;
    if (activeTab === "unrecoverable") return isUnrecoverable;
    return !isCompleted && !isNotFound && !isUnrecoverable; // Pending tab
  }).sort((a, b) => {
    if (sortBy === "trn_asc") return a.packetCode.localeCompare(b.packetCode);
    if (sortBy === "trn_desc") return b.packetCode.localeCompare(a.packetCode);
    return 0; // Default uses the original order from restorePackets
  });

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
          <div style={{ display: "flex", gap: 10 }}>
            
            {activeTab === "not_found" && (
              <button className="btn btn-primary" onClick={retryAllNotFoundPackets} disabled={isRecoveringAll || listLoading || notFoundPacketsCount === 0}>
                {isRecoveringAll ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={16} />}
                {isRecoveringAll ? "Retrying..." : "Retry All"}
              </button>
            )}
            <button className="btn btn-primary" onClick={recoverAllPendingPackets} disabled={isRecoveringAll || listLoading || pendingToRecoverCount === 0}>

              {isRecoveringAll ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <HardDriveDownload size={16} />}
              {isRecoveringAll ? "Recovering..." : "Recover All"}
            </button>
            <button className="btn btn-primary" onClick={postAllPendingComments} disabled={isPostingAll || listLoading || pendingToPostCount === 0}>
              {isPostingAll ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <MessageSquare size={16} />}
              {isPostingAll ? "Posting..." : "Post All Comments"}
            </button>
            <button className="btn btn-secondary" onClick={() => exportToExcel(displayPackets)} disabled={listLoading || displayPackets.length === 0}>
              <Download size={16} />
              Export .xlsx
            </button>
            <button className="btn" onClick={loadRestorePackets} disabled={listLoading || isPostingAll || isRecoveringAll}>
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, padding: "0 16px", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          <button 
            onClick={() => setActiveTab("pending")}
            style={{ 
              padding: "8px 12px", 
              background: "none", 
              border: "none", 
              borderBottom: activeTab === "pending" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "pending" ? "var(--primary-dark)" : "var(--muted)",
              fontWeight: activeTab === "pending" ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center"
            }}
          >
            Pending
            <span style={{ background: activeTab === "pending" ? "var(--primary-light)" : "var(--border)", color: activeTab === "pending" ? "var(--primary-dark)" : "var(--muted)", padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600 }}>{pendingPacketsCount}</span>
          </button>
          <button 
            onClick={() => setActiveTab("completed")}
            style={{ 
              padding: "8px 12px", 
              background: "none", 
              border: "none", 
              borderBottom: activeTab === "completed" ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === "completed" ? "var(--primary-dark)" : "var(--muted)",
              fontWeight: activeTab === "completed" ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center"
            }}
          >
            Completed
            <span style={{ background: activeTab === "completed" ? "var(--primary-light)" : "var(--border)", color: activeTab === "completed" ? "var(--primary-dark)" : "var(--muted)", padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600 }}>{completedPacketsCount}</span>
          </button>
          <button 
            onClick={() => setActiveTab("not_found")}
            style={{ 
              padding: "8px 12px", 
              background: "none", 
              border: "none", 
              borderBottom: activeTab === "not_found" ? "2px solid var(--danger)" : "2px solid transparent",
              color: activeTab === "not_found" ? "var(--danger)" : "var(--muted)",
              fontWeight: activeTab === "not_found" ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center"
            }}
          >
            No Packet Found
            <span style={{ background: activeTab === "not_found" ? "var(--danger-light, #fee2e2)" : "var(--border)", color: activeTab === "not_found" ? "var(--danger)" : "var(--muted)", padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600 }}>{notFoundPacketsCount}</span>
          </button>
          <button 
            onClick={() => setActiveTab("unrecoverable")}
            style={{ 
              padding: "8px 12px", 
              background: "none", 
              border: "none", 
              borderBottom: activeTab === "unrecoverable" ? "2px solid #991b1b" : "2px solid transparent",
              color: activeTab === "unrecoverable" ? "#991b1b" : "var(--muted)",
              fontWeight: activeTab === "unrecoverable" ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              gap: 8,
              alignItems: "center"
            }}
          >
            Unrecoverable
            <span style={{ background: activeTab === "unrecoverable" ? "#fef2f2" : "var(--border)", color: activeTab === "unrecoverable" ? "#991b1b" : "var(--muted)", padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem", fontWeight: 600 }}>{unrecoverablePacketsCount}</span>
          </button>
        </div>

        <div style={{ padding: "0 16px 16px", display: "flex", gap: 16, alignItems: "center", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          <select 
            className="select" 
            style={{ minWidth: 200 }}
            value={filterProvince}
            onChange={e => setFilterProvince(e.target.value)}
          >
            <option value="">All Provinces</option>
            {uniqueProvinces.map(prov => (
              <option key={prov} value={prov}>{prov}</option>
            ))}
          </select>
          <select 
            className="select"
            style={{ minWidth: 200 }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="default">Default Sort (MisOr first)</option>
            <option value="trn_asc">TRN (Ascending)</option>
            <option value="trn_desc">TRN (Descending)</option>
          </select>
        </div>

        {listLoading && (
          <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            Loading backend restoration packets...
          </div>
        )}

        {!listLoading && (
          <div style={{ padding: "20px 16px", color: "var(--muted)", display: "none" }}>
            No backend restoration packets with matched tickets found.
          </div>
        )}

        {(() => {
    if (!listLoading && displayPackets.length === 0) {
            return (
              <div style={{ padding: "20px 16px", color: "var(--muted)" }}>
                No backend restoration packets found in this tab.
              </div>
            );
          }

          if (displayPackets.length > 0) {
            return (
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
                    {displayPackets.map(packet => {
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
                            {packet.requiredInitialTrn || packet.packetCode}
                          </div>
                          {packet.requiredInitialTrn && (
                            <div style={{
                              fontSize: "0.75rem",
                              marginTop: 4,
                              color: "var(--muted)",
                            }}>
                              Original: {packet.packetCode}
                            </div>
                          )}
                          {(packet.proLptFolder || packet.province) && (
                            <div style={{ fontSize: "0.75rem", marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {packet.requiredInitialTrn && (
                                <span style={{
                                  background: "#fef08a",
                                  color: "#854d0e",
                                  padding: "1px 7px",
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  fontSize: "0.72rem",
                                }}>
                                  Initial Registration
                                </span>
                              )}
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
                              disabled={isRecoveringAll}
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
                                  disabled={isCommenting || isPostingAll}
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
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ color: "var(--danger)", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}>
                                <XCircle size={14} /> {job.error?.includes("Packet not found") ? "Packet Not Found" : "Failed"}
                              </span>
                              {!job.unrecoverableTagged ? (
                                <>
                                  {job.error?.includes("Packet not found") && (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                                      disabled={isCommenting}
                                      onClick={() => tagUnrecoverable(packet, job)}
                                    >
                                      Tag Unrecoverable
                                    </button>
                                  )}
                                  <button
                                    className="btn"
                                    style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                                    onClick={() => resetJob(packet.id)}
                                  >
                                    Retry
                                  </button>
                                </>
                              ) : (
                                <span style={{ color: "#eab308", fontWeight: 700, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}>
                                  <CheckCircle size={14} /> Tagged Unrecoverable
                                </span>
                              )}
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
            );
          }
          return null;
        })()}

        {confirmDialog && (
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", animation: "fadeIn 0.2s ease-out" }}>
            <div style={{ background: "var(--surface)", borderRadius: "12px", width: "100%", maxWidth: "420px", padding: "24px", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)", border: "1px solid var(--border)", animation: "slideUp 0.2s ease-out" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 12px 0", color: "var(--foreground)" }}>{confirmDialog.title}</h2>
              <p style={{ margin: "0 0 24px 0", color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                {confirmDialog.message}
              </p>
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button 
                  className="btn"
                  onClick={confirmDialog.onCancel}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={confirmDialog.onConfirm}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { 100% { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        ` }} />
      </section>
    </>
  );
}
