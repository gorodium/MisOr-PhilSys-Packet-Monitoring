"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, CheckCircle, XCircle, Loader2, FileArchive, Play, Trash2, Calendar, MapPin, Database } from "lucide-react";

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface FileUpload {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  message?: string;
  nasPath?: string;
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

export default function UploadPage() {
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<UploadHistoryRecord[]>([]);
  const [kpiCards, setKpiCards] = useState<KPICard[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

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
    const zipFiles = files.filter(f => f.name.toLowerCase().endsWith('.zip'));
    
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
      
      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: "success", 
        progress: 100,
        nasPath: response.path 
      } : u));

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

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  const clearCompleted = () => {
    setUploads(prev => prev.filter(u => u.status !== "success"));
  };

  const pendingCount = uploads.filter(u => u.status === "pending" || u.status === "error").length;
  const uploadingCount = uploads.filter(u => u.status === "uploading").length;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text)" }}>Upload Packets to NAS</h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "14px" }}>
            Upload packet ZIP files to the NAS. The destination folder (PRO-LPT) will be automatically determined from the TRN in the filename.
          </p>
        </div>
      </div>

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
            backgroundColor: "rgba(0,0,0,0.02)"
          }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
              Upload Queue ({uploads.length})
            </h3>
            <div style={{ display: "flex", gap: "12px" }}>
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", fontSize: "12px", gap: "6px" }}>
                        {upload.status === 'pending' && <span style={{ color: "var(--muted)" }}>Ready to upload</span>}
                        {upload.status === 'uploading' && <span style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}><Loader2 size={12} className="spin" /> Uploading {upload.progress}%</span>}
                        {upload.status === 'success' && <span style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}><CheckCircle size={12} /> {upload.nasPath}</span>}
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
          backgroundColor: "rgba(0,0,0,0.02)"
        }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={16} /> Upload History
          </h3>
          <button onClick={fetchHistory} className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "13px" }}>
            {loadingHistory ? <Loader2 size={14} className="spin" /> : <Play size={14} style={{ transform: "rotate(90deg)" }} />}
            Refresh
          </button>
        </div>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Date</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Filename</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>TRN</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>Province</th>
                <th style={{ padding: "12px 20px", textAlign: "left", fontWeight: 600, color: "var(--muted)" }}>NAS Path</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
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
                    <td style={{ padding: "12px 20px", fontWeight: 500 }}>{record.filename}</td>
                    <td style={{ padding: "12px 20px", fontFamily: "monospace" }}>{record.trn}</td>
                    <td style={{ padding: "12px 20px" }}>
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
