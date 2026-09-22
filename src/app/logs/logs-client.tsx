"use client";

import { useEffect, useState } from "react";
import { ActivityType } from "@/lib/activity";
import {
  FilePlus,
  Ticket,
  HardDriveUpload,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  UploadCloud,
  FileClock,
  Clock,
  CheckCircle2,
  XCircle,
  Tag
} from "lucide-react";

type ActivityLog = {
  id: string;
  type: ActivityType;
  actor: string;
  message: string;
  metadata: Record<string, any> | null;
  createdAt: string;
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  FILING_REQUEST: <FilePlus size={18} style={{ color: "var(--primary)" }} />,
  TICKET_FILED: <Ticket size={18} style={{ color: "#0ea5e9" }} />,
  RESTORATION: <HardDriveUpload size={18} style={{ color: "#10b981" }} />,
  UNRECOVERABLE: <Tag size={18} style={{ color: "#ef4444" }} />,
  MATRIX_REPLY: <MessageSquare size={18} style={{ color: "#8b5cf6" }} />,
  REFILE: <AlertTriangle size={18} style={{ color: "#f59e0b" }} />,
  MANUAL_UPLOAD: <UploadCloud size={18} style={{ color: "#6366f1" }} />,
};

const TYPE_LABELS: Record<string, string> = {
  ALL: "All Activity",
  FILING_REQUEST: "Filing Requests",
  TICKET_FILED: "Matrix Tickets",
  RESTORATION: "Restorations",
  UNRECOVERABLE: "Unrecoverable Tags",
  MATRIX_REPLY: "Replies",
  REFILE: "Tracker Refiles",
  MANUAL_UPLOAD: "Manual Uploads",
};

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date);
}

export function LogsClient() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  async function loadLogs(pageNum: number, type: string, append = false) {
    setLoading(true);
    if (!append) setError("");
    
    try {
      const url = new URL("/api/logs", window.location.origin);
      url.searchParams.set("page", pageNum.toString());
      if (type !== "ALL") url.searchParams.set("type", type);

      const response = await fetch(url.toString(), { cache: "no-store" });
      const payload = await response.json();
      
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load activity logs.");
      }
      
      if (append) {
        setActivities((prev) => [...prev, ...payload.activities]);
      } else {
        setActivities(payload.activities);
      }
      
      setTotalCount(payload.totalCount);
      setHasMore(pageNum * payload.pageSize < payload.totalCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void loadLogs(1, activeFilter, false);
  }, [activeFilter]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    void loadLogs(nextPage, activeFilter, true);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 40 }}>
      <header className="page-header" style={{ marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileClock size={24} style={{ color: "var(--primary)" }} />
            Activity Logs
          </h1>
          <p className="page-kicker">Track all system events, filings, and restorations.</p>
        </div>
        <button 
          className="btn" 
          onClick={() => { setPage(1); loadLogs(1, activeFilter, false); }} 
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </header>

      {error ? <div className="alert error-text" style={{ marginBottom: 20 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 20 }}>
        {Object.keys(TYPE_LABELS).map((type) => (
          <button
            key={type}
            onClick={() => setActiveFilter(type)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: activeFilter === type ? "var(--primary)" : "var(--surface)",
              color: activeFilter === type ? "white" : "var(--foreground)",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.2s ease"
            }}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {activities.length === 0 && !loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <FileClock size={40} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
            <p>No activity found.</p>
          </div>
        ) : (
          activities.map((log) => (
            <div 
              key={log.id} 
              style={{ 
                background: "var(--surface)", 
                border: "1px solid var(--border)", 
                borderRadius: 12, 
                padding: "16px",
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}
            >
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: "50%", 
                background: "var(--background)", 
                border: "1px solid var(--border)",
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                flexShrink: 0
              }}>
                {TYPE_ICONS[log.type] || <CheckCircle2 size={18} />}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 4, lineHeight: 1.5, fontSize: "0.95rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{log.actor}</span>
                  {" "}
                  <span style={{ color: "var(--foreground)" }} dangerouslySetInnerHTML={{ __html: log.message.replace(log.actor, "") }} />
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.8rem", color: "var(--muted)", marginTop: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} />
                    {formatTimeAgo(log.createdAt)}
                  </span>
                  
                  {log.metadata?.trn && (
                    <span style={{ background: "var(--background)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--border)" }}>
                      TRN: {log.metadata.trn}
                    </span>
                  )}
                  {log.metadata?.ticketNumber && (
                    <a href={`/dashboard/requests`} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}>
                      Ticket #{log.metadata.ticketNumber}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button 
            className="btn" 
            onClick={handleLoadMore} 
            disabled={loading}
            style={{ background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          >
            {loading ? "Loading..." : "Load More Activity"}
          </button>
        </div>
      )}
    </div>
  );
}
