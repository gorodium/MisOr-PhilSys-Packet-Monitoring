"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle, XCircle, Loader2, FileArchive, Play, Trash2, Calendar, MapPin, Database, RefreshCw, HardDriveDownload, ExternalLink } from "lucide-react";

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface SyncedRestorationPacket {
  id: string;
  packetCode: string;
  requiredInitialTrn: string | null;
  matchedTrn: string;
  ticketId: string;
  ticketNumber: string;
  proLptFolder: string;
  province: string;
  restorationUploaded: boolean;
  restorationCommented: boolean;
  wasNotFound: boolean;
}

interface FileUpload {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  message?: string;
  nasPath?: string;
  alreadyExists?: boolean;
  matchedRestorationPackets?: SyncedRestorationPacket[];
}

interface UploadHistoryRecord {
  id: string;
  trn: string;
  filename: string;
  nasPath: string;
  province: string;
  createdAt: string;
}

interface KPICard {
  province: string;
  count: number;
}

function clearGlobalAutomationJobForPacket(packetId: string) {
  const store = (globalThis as any).__automationGlobalStore;
  if (store?.jobs) {
    store.jobs.delete(packetId);
    if (store.listeners) {
      store.listeners.forEach((l: () => void) => l());
    }
  }
}

export default function UploadPage() {
  const router = useRouter();
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<UploadHistoryRecord[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [syncingRestoration, setSyncingRestoration] = useState(false);
  const [syncedMatches, setSyncedMatches] = useState<SyncedRestorationPacket[] | null>(null);
  const [processingRestoreIds, setProcessingRestoreIds] = useState<Set<string>>(new Set());
  const [processedRestoreResults, setProcessedRestoreResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [isProcessingAllMatched, setIsProcessingAllMatched] = useState(false);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/upload-history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setKpiCards(data.kpiCards || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    const zipFiles = files.filter(f => f.name.toLowerCase().endsWith(".zip"));
    
    if (zipFiles.length < files.length) {
      alert(`Ignored ${files.length - zipFiles.length} non-ZIP files.`);
    }

    const newUploads: FileUpload[] = zipFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: "pending",
      progress: 0
    }));

    setUploads(prev => [...prev, ...newUploads]);
  };

  const uploadFile = async (uploadId: string, file: File) => {
    setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "uploading", progress: 0 } : u));
    
    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      
      const promise = new Promise((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress } : u));
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const res = JSON.parse(xhr.responseText);
            if (res.success) resolve(res);
            else reject(new Error(res.error || "Upload failed"));
          } else {
            try {
              const res = JSON.parse(xhr.responseText);
              reject(new Error(res.error || "Upload failed"));
            } catch (e) {
              reject(new Error("Upload failed"));
            }
          }
        };
        
        xhr.onerror = () => reject(new Error("Network error"));
      });
      
      xhr.open("POST", "/api/upload-packet");
      xhr.send(formData);
      
      const response: any = await promise;
      const matched: SyncedRestorationPacket[] = response.matchedRestorationPackets || [];
      matched.forEach(m => {
        if (!m.restorationUploaded || !m.restorationCommented) {
          clearGlobalAutomationJobForPacket(m.id);
        }
      });

      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: "success", 
        progress: 100,
        nasPath: response.path,
        alreadyExists: response.alreadyExists,
        matchedRestorationPackets: matched
      } : u));

      if (matched.length > 0) {
        setSyncedMatches(prev => {
          const existing = prev ? [...prev] : [];
          for (const m of matched) {
            if (!existing.some(x => x.id === m.id)) {
              existing.push(m);
            }
          }
          return existing;
        });
      }

      // Refresh history silently
      fetchHistory();
      
    } catch (error: any) {
      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: "error", 
        message: error.message 
      } : u));
    }
  };

  const startUploads = () => {
    const pendingUploads = uploads.filter(u => u.status === "pending" || u.status === "error");
    pendingUploads.forEach(u => uploadFile(u.id, u.file));
  };

  const syncWithBackendRestoration = async (trnsToSync?: string[]) => {
    setSyncingRestoration(true);
    try {
      const res = await fetch("/api/upload-packet/sync-restoration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trnsToSync && trnsToSync.length > 0 ? { trns: trnsToSync } : {})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to sync with Backend Restoration");
      }
      const matched: SyncedRestorationPacket[] = data.matchedPackets || [];
      matched.forEach(m => {
        if (!m.restorationUploaded || !m.restorationCommented) {
          clearGlobalAutomationJobForPacket(m.id);
        }
      });
      setSyncedMatches(matched);
    } catch (err: any) {
      alert(err?.message || "Failed to sync with Backend Restoration");
    } finally {
      setSyncingRestoration(false);
    }
  };

  const processSingleMatchedPacket = async (pkt: SyncedRestorationPacket) => {
    setProcessingRestoreIds(prev => new Set(prev).add(pkt.id));
    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: pkt.id,
          trn: pkt.requiredInitialTrn || pkt.packetCode,
          ticketId: pkt.ticketId,
          ticketNumber: pkt.ticketNumber,
          proLptFolder: pkt.proLptFolder || undefined,
          province: pkt.province || undefined
        })
      });
      const payload = await res.json();
      if (payload.success) {
        setProcessedRestoreResults(prev => ({
          ...prev,
          [pkt.id]: { ok: true, msg: `Uploaded to ${payload.destFolder}` }
        }));
        setSyncedMatches(prev =>
          prev ? prev.map(m => m.id === pkt.id ? { ...m, restorationUploaded: true, wasNotFound: false } : m) : prev
        );
        const store = (globalThis as any).__automationGlobalStore;
        if (store?.jobs) {
          store.jobs.set(pkt.id, {
            phase: "success",
            steps: (payload.steps || []).map((s: string) => ({ text: s, type: "ok" })),
            uploadedTo: payload.uploadedTo ?? "",
            destFolder: payload.destFolder ?? "",
            packetName: payload.packetName ?? "",
            alreadyUploaded: payload.alreadyUploaded ?? false,
            commentPosted: false,
            originTab: "pending"
          });
          store.listeners?.forEach((l: () => void) => l());
        }
      } else {
        setProcessedRestoreResults(prev => ({
          ...prev,
          [pkt.id]: { ok: false, msg: payload.error || "Failed to process" }
        }));
      }
    } catch (err: any) {
      setProcessedRestoreResults(prev => ({
        ...prev,
        [pkt.id]: { ok: false, msg: err?.message || "Network error" }
      }));
    } finally {
      setProcessingRestoreIds(prev => {
        const next = new Set(prev);
        next.delete(pkt.id);
        return next;
      });
    }
  };

  const processAllMatchedPackets = async () => {
    if (!syncedMatches || isProcessingAllMatched) return;
    const toProcess = syncedMatches.filter(m => !m.restorationUploaded || !m.restorationCommented);
    if (toProcess.length === 0) return;

    setIsProcessingAllMatched(true);
    for (const pkt of toProcess) {
      if (!pkt.restorationUploaded) {
        await processSingleMatchedPacket(pkt);
      }
    }
    setIsProcessingAllMatched(false);
  };

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  const clearCompleted = () => {
    setUploads(prev => prev.filter(u => u.status !== "success"));
  };

  const pendingCount = uploads.filter(u => u.status === "pending" || u.status === "error").length;
  const uploadingCount = uploads.filter(u => u.status === "uploading").length;
  const uncompletedMatchedCount = (syncedMatches || []).filter(m => !m.restorationUploaded).length;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text)" }}>Upload Packets to NAS</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "14px" }}>
            Upload packet ZIP files to the NAS. The destination folder (PRO-LPT) will be automatically determined from the TRN in the filename.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={() => syncWithBackendRestoration()}
            disabled={syncingRestoration}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
            title="Check uploaded packets against the Backend Restoration list and move matching packets to Pending"
          >
            {syncingRestoration ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {syncingRestoration ? "Syncing with Backend Restoration..." : "Sync to Backend Restoration"}
          </button>
        </div>
      </div>

      {/* Synced Backend Restoration Panel */}
      {syncedMatches !== null && (
        <div style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent, #155e75)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "var(--shadow)",
          marginBottom: "28px"
        }}>
          <div style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            backgroundColor: "rgba(21, 94, 117, 0.04)"
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
                <HardDriveDownload size={17} />
                Backend Restoration Sync ({syncedMatches.length} matched packet{syncedMatches.length === 1 ? "" : "s"})
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--muted)" }}>
                {syncedMatches.length === 0
                  ? "None of the uploaded packets currently match an active item on the Backend Restoration list."
                  : "Matched packets have been synced to Backend Restoration (Pending). You can process them directly below or open Backend Restoration."}
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {uncompletedMatchedCount > 0 && (
                <button
                  onClick={processAllMatchedPackets}
                  disabled={isProcessingAllMatched}
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  {isProcessingAllMatched ? <Loader2 size={15} className="spin" /> : <HardDriveDownload size={15} />}
                  {isProcessingAllMatched ? "Processing..." : `Process All in Backend Restoration (${uncompletedMatchedCount})`}
                </button>
              )}
              <button
                onClick={() => router.push("/automation")}
                className="btn"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <ExternalLink size={15} />
                Open Backend Restoration
              </button>
              <button
                onClick={() => setSyncedMatches(null)}
                className="btn"
                style={{ padding: "6px 10px", fontSize: "12px" }}
              >
                Dismiss
              </button>
            </div>
          </div>

          {syncedMatches.length > 0 && (
            <div style={{ overflowX: "auto", maxHeight: "320px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>TRN</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Ticket #</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>PRO-LPT / Province</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Backend Restoration Status</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "var(--muted)" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {syncedMatches.map(pkt => {
                    const isProcessing = processingRestoreIds.has(pkt.id);
                    const result = processedRestoreResults[pkt.id];
                    return (
                      <tr key={pkt.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 600 }}>
                          {pkt.requiredInitialTrn || pkt.packetCode}
                          {pkt.requiredInitialTrn && (
                            <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 400 }}>
                              Original: {pkt.packetCode}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace" }}>#{pkt.ticketNumber}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ background: "#dbeafe", color: "#1d4ed8", padding: "2px 6px", borderRadius: "4px", fontWeight: 600, fontSize: "11px", marginRight: "6px" }}>
                            {pkt.proLptFolder}
                          </span>
                          <span style={{ color: "var(--muted)", fontSize: "12px" }}>{pkt.province}</span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {result ? (
                            <span style={{ color: result.ok ? "#16a34a" : "#dc2626", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              {result.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
                              {result.msg}
                            </span>
                          ) : pkt.restorationUploaded ? (
                            <span style={{ color: "#16a34a", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <CheckCircle size={14} /> {pkt.restorationCommented ? "Completed (Replied)" : "Uploaded to Ticket Folder"}
                            </span>
                          ) : (
                            <span style={{ color: "#d97706", fontWeight: 600 }}>
                              Synced to Pending {pkt.wasNotFound ? "(Moved from Not Found)" : ""}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {!pkt.restorationUploaded && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: "4px 12px", fontSize: "12px" }}
                              disabled={isProcessing || isProcessingAllMatched}
                              onClick={() => processSingleMatchedPacket(pkt)}
                            >
                              {isProcessing ? <Loader2 size={13} className="spin" /> : <HardDriveDownload size={13} />}
                              {isProcessing ? "Processing..." : "Process Now"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      {kpiCards.length > 0 && (
        <div style={{ display: "flex", gap: "16px", marginBottom: "32px", flexWrap: "wrap" }}>
          {kpiCards.map((kpi, idx) => (
            <div key={idx} style={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "20px",
              minWidth: "200px",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "14px", fontWeight: 500 }}>
                <MapPin size={16} /> {kpi.province}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)" }}>
                {kpi.count}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dropzone */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
          backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface)',
          borderRadius: "16px",
          padding: "64px 32px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
          marginBottom: "32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "240px"
        }}
      >
        <UploadCloud 
          size={48} 
          style={{ 
            margin: "0 auto 16px auto", 
            color: isDragging ? 'var(--primary)' : 'var(--muted)',
            opacity: 0.7
          }} 
        />
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text)", margin: "0 0 8px 0" }}>
          Drag and drop ZIP files here
        </h3>
        <p style={{ fontSize: "14px", color: "var(--muted)", margin: "0 0 24px 0" }}>
          or click to browse your files
        </p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          style={{ display: "none" }}
          multiple 
          accept=".zip" 
        />
        <button 
          className="btn"
          style={{ pointerEvents: "none" }}
        >
          Select Files
        </button>
      </div>

      {/* Upload Queue */}
      {uploads.length > 0 && (
        <div style={{ 
          backgroundColor: "var(--surface)", 
          border: "1px solid var(--border)", 
          borderRadius: "12px", 
          overflow: "hidden",
          boxShadow: "var(--shadow)",
          marginBottom: "32px"
        }}>
          <div style={{ 
            padding: "16px 20px", 
            borderBottom: "1px solid var(--border)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between",
            backgroundColor: "rgba(0,0,0,0.02)",
            flexWrap: "wrap",
            gap: "10px"
          }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
              Upload Queue ({uploads.length})
            </h3>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const queueTrns = uploads
                    .map(u => u.file.name.match(/^(\d{29})/)?.[1] || "")
                    .filter(Boolean);
                  syncWithBackendRestoration(queueTrns);
                }}
                disabled={syncingRestoration}
                className="btn"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {syncingRestoration ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                Sync Queue to Backend Restoration
              </button>
              <button 
                onClick={clearCompleted}
                className="btn btn-outline"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                Clear Completed
              </button>
              <button 
                onClick={startUploads}
                disabled={pendingCount === 0 || uploadingCount > 0}
                className="btn btn-primary"
                style={{ 
                  display: "flex", alignItems: "center", gap: "6px",
                  opacity: (pendingCount === 0 || uploadingCount > 0) ? 0.6 : 1,
                  cursor: (pendingCount === 0 || uploadingCount > 0) ? "not-allowed" : "pointer"
                }}
              >
                <Play size={16} />
                {uploadingCount > 0 ? 'Uploading...' : `Start Upload (${pendingCount})`}
              </button>
            </div>
          </div>
          
          <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "40vh", overflowY: "auto" }}>
            {uploads.map((upload, idx) => (
              <li key={upload.id} style={{ 
                padding: "16px 20px", 
                borderBottom: idx === uploads.length - 1 ? "none" : "1px solid var(--border)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ padding: "10px", backgroundColor: "rgba(59, 130, 246, 0.1)", borderRadius: "8px", color: "var(--primary)", flexShrink: 0 }}>
                    <FileArchive size={24} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={upload.file.name}>
                        {upload.file.name}
                      </p>
                      <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap", marginLeft: "16px" }}>
                        {(upload.file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "4px", height: "6px", marginBottom: "6px", overflow: "hidden" }}>
                      <div style={{ height: "100%", backgroundColor: upload.status === 'error' ? '#ef4444' : upload.status === 'success' ? '#22c55e' : 'var(--primary)', width: `${upload.progress}%`, transition: "width 0.3s ease" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", fontSize: "12px", gap: "8px", flexWrap: "wrap" }}>
                        {upload.status === 'pending' && <span style={{ color: "var(--muted)" }}>Ready to upload</span>}
                        {upload.status === 'uploading' && <span style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}><Loader2 size={12} className="spin" /> Uploading {upload.progress}%</span>}
                        {upload.status === 'success' && (
                          <>
                            <span style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
                              <CheckCircle size={12} /> {upload.alreadyExists ? `Already on NAS (${upload.nasPath})` : upload.nasPath}
                            </span>
                            {upload.matchedRestorationPackets && upload.matchedRestorationPackets.length > 0 && (
                              <span style={{
                                backgroundColor: "#fef3c7",
                                color: "#92400e",
                                border: "1px solid #fde68a",
                                borderRadius: "999px",
                                padding: "2px 8px",
                                fontSize: "11px",
                                fontWeight: 600
                              }}>
                                🔗 Matched Backend Restoration (Ticket #{upload.matchedRestorationPackets.map(m => m.ticketNumber).join(", #")}) — Synced to Pending
                              </span>
                            )}
                          </>
                        )}
                        {upload.status === 'error' && <span style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}><XCircle size={12} /> {upload.message}</span>}
                      </div>
                      {upload.status !== 'uploading' && (
                        <button onClick={(e) => { e.stopPropagation(); removeUpload(upload.id); }} style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: "4px" }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload History Table */}
      <div style={{ 
        backgroundColor: "var(--surface)", 
        border: "1px solid var(--border)", 
        borderRadius: "12px", 
        overflow: "hidden",
        boxShadow: "var(--shadow)"
      }}>
        <div style={{ 
          padding: "16px 20px", 
          borderBottom: "1px solid var(--border)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          backgroundColor: "rgba(0,0,0,0.02)",
          flexWrap: "wrap",
          gap: "8px"
        }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={16} /> Upload History
          </h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={() => syncWithBackendRestoration()}
              disabled={syncingRestoration}
              className="btn"
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }}
            >
              {syncingRestoration ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              Sync History to Backend Restoration
            </button>
            <button onClick={fetchHistory} className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }}>
              {loadingHistory ? <Loader2 size={14} className="spin" /> : <Play size={14} style={{ transform: "rotate(90deg)" }} />}
              Refresh
            </button>
          </div>
        </div>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Date</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>TRN</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>Province</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>NAS Path</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
                    {loadingHistory ? "Loading history..." : "No packets have been manually uploaded yet."}
                  </td>
                </tr>
              ) : (
                history.map((record) => (
                  <tr key={record.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 20px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Calendar size={14} />
                        {new Date(record.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ padding: "12px 20px", fontFamily: "monospace" }}>{record.trn}</td>
                    <td style={{ padding: "12px 20px", whiteSpace: "nowrap" }}>
                      <span style={{ 
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        backgroundColor: "rgba(59,130,246,0.1)", color: "var(--primary)",
                        padding: "4px 8px", borderRadius: "100px", fontSize: "12px", fontWeight: 600
                      }}>
                        <MapPin size={12} /> {record.province}
                      </span>
                    </td>
                    <td style={{ padding: "12px 20px", color: "var(--muted)", fontSize: "13px" }}>{record.nasPath}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
