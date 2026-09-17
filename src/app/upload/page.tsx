"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle, XCircle, Loader2, FileArchive, Play, Trash2 } from "lucide-react";

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface FileUpload {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  message?: string;
  nasPath?: string;
}

export default function UploadPage() {
  const [uploads, setUploads] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addFiles = (newFiles: File[]) => {
    const zipFiles = newFiles.filter(f => f.name.toLowerCase().endsWith(".zip"));
    
    if (zipFiles.length !== newFiles.length) {
      alert("Only .zip files are allowed");
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

    const formData = new FormData();
    formData.append("file", file);

    try {
      const xhr = new XMLHttpRequest();
      
      const promise = new Promise((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded * 100) / event.total);
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress } : u));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.success) resolve(res);
              else reject(new Error(res.error || "Upload failed"));
            } catch (e) {
              reject(new Error("Invalid response from server"));
            }
          } else {
            try {
              const res = JSON.parse(xhr.responseText);
              reject(new Error(res.error || `Server error: ${xhr.status}`));
            } catch (e) {
              reject(new Error(`Server error: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error occurred")));
        
        xhr.open("POST", "/api/upload-packet");
        xhr.send(formData);
      });

      const result: any = await promise;
      
      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: "success", 
        progress: 100, 
        nasPath: result.path 
      } : u));

    } catch (err: any) {
      setUploads(prev => prev.map(u => u.id === uploadId ? { 
        ...u, 
        status: "error", 
        message: err.message 
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

  const pendingCount = uploads.filter(u => u.status === "pending").length;
  const uploadingCount = uploads.filter(u => u.status === "uploading").length;

  return (
    <div style={{ padding: "32px", maxWidth: "900px", margin: "0 auto", fontFamily: "inherit" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text)" }}>Upload Packets to NAS</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "14px", lineHeight: 1.5 }}>
          Upload packet ZIP files to the NAS. The destination folder (PRO-LPT) will be automatically determined from the TRN in the filename.
        </p>
      </header>

      {/* Drag & Drop Area */}
      <div 
        style={{
          border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
          backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface)',
          borderRadius: "12px",
          padding: "48px 32px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
          marginBottom: "32px"
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
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
          style={{ pointerEvents: "none" }} // button click is handled by the parent div
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
          
          <ul style={{ 
            listStyle: "none", 
            margin: 0, 
            padding: 0, 
            maxHeight: "60vh", 
            overflowY: "auto" 
          }}>
            {uploads.map((upload, idx) => (
              <li key={upload.id} style={{ 
                padding: "16px 20px", 
                borderBottom: idx === uploads.length - 1 ? "none" : "1px solid var(--border)",
                transition: "background-color 0.2s"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{ 
                    padding: "10px", 
                    backgroundColor: "rgba(59, 130, 246, 0.1)", 
                    borderRadius: "8px", 
                    color: "var(--primary)",
                    flexShrink: 0
                  }}>
                    <FileArchive size={24} />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <p style={{ 
                        margin: 0, 
                        fontSize: "14px", 
                        fontWeight: 500, 
                        color: "var(--text)", 
                        whiteSpace: "nowrap", 
                        overflow: "hidden", 
                        textOverflow: "ellipsis" 
                      }} title={upload.file.name}>
                        {upload.file.name}
                      </p>
                      <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap", marginLeft: "16px" }}>
                        {(upload.file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div style={{ 
                      width: "100%", 
                      backgroundColor: "var(--border)", 
                      borderRadius: "4px", 
                      height: "6px", 
                      marginBottom: "6px", 
                      overflow: "hidden" 
                    }}>
                      <div 
                        style={{ 
                          height: "100%", 
                          backgroundColor: upload.status === 'error' ? '#ef4444' : upload.status === 'success' ? '#22c55e' : 'var(--primary)',
                          width: `${upload.progress}%`,
                          transition: "width 0.3s ease, background-color 0.3s ease"
                        }}
                      />
                    </div>
                    
                    {/* Status Text */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", fontSize: "12px", gap: "6px" }}>
                        {upload.status === 'pending' && <span style={{ color: "var(--muted)" }}>Ready to upload</span>}
                        {upload.status === 'uploading' && (
                          <span style={{ color: "var(--primary)", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
                            <Loader2 size={12} className="spin" /> Uploading {upload.progress}%
                          </span>
                        )}
                        {upload.status === 'success' && (
                          <span style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
                            <CheckCircle size={12} /> {upload.nasPath}
                          </span>
                        )}
                        {upload.status === 'error' && (
                          <span style={{ color: "#dc2626", display: "flex", alignItems: "center", gap: "4px", fontWeight: 500 }}>
                            <XCircle size={12} /> {upload.message}
                          </span>
                        )}
                      </div>
                      
                      {upload.status !== 'uploading' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeUpload(upload.id);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--muted)",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                            borderRadius: "4px"
                          }}
                          title="Remove from list"
                        >
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
      
      <style dangerouslySetInnerHTML={{__html: `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
