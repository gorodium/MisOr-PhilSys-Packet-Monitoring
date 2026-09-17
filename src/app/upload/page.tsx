"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle, XCircle, Loader2, FileArchive } from "lucide-react";

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
      // Create an XMLHttpRequest to track upload progress
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
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Packets to NAS</h1>
        <p className="text-gray-600">
          Upload packet ZIP files to the NAS. The destination folder (PRO-LPT) will be automatically determined from the TRN in the filename.
        </p>
      </div>

      <div 
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors mb-8 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud className={`mx-auto h-16 w-16 mb-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
        <h3 className="text-xl font-medium text-gray-900 mb-1">
          Drag and drop ZIP files here
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          or click to browse your files
        </p>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          className="hidden" 
          multiple 
          accept=".zip" 
        />
        <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          Select Files
        </button>
      </div>

      {uploads.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <h3 className="font-semibold text-gray-900">Upload Queue ({uploads.length})</h3>
            <div className="flex gap-2">
              <button 
                onClick={clearCompleted}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Clear Completed
              </button>
              <button 
                onClick={startUploads}
                disabled={pendingCount === 0 || uploadingCount > 0}
                className={`px-4 py-1.5 text-sm font-medium rounded text-white ${pendingCount === 0 || uploadingCount > 0 ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}
              >
                {uploadingCount > 0 ? 'Uploading...' : `Start Upload (${pendingCount})`}
              </button>
            </div>
          </div>
          
          <ul className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {uploads.map(upload => (
              <li key={upload.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-50 rounded text-blue-600 flex-shrink-0">
                    <FileArchive size={20} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate" title={upload.file.name}>
                        {upload.file.name}
                      </p>
                      <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
                        {(upload.file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1 overflow-hidden">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-300 ${upload.status === 'error' ? 'bg-red-500' : upload.status === 'success' ? 'bg-green-500' : 'bg-blue-600'}`}
                        style={{ width: `${upload.progress}%` }}
                      ></div>
                    </div>
                    
                    {/* Status Text */}
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center text-xs">
                        {upload.status === 'pending' && <span className="text-gray-500">Ready to upload</span>}
                        {upload.status === 'uploading' && <span className="text-blue-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Uploading {upload.progress}%</span>}
                        {upload.status === 'success' && <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> {upload.nasPath}</span>}
                        {upload.status === 'error' && <span className="text-red-600 flex items-center gap-1"><XCircle size={12} /> {upload.message}</span>}
                      </div>
                      
                      {upload.status !== 'uploading' && (
                        <button 
                          onClick={() => removeUpload(upload.id)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                        >
                          Remove
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
    </div>
  );
}
