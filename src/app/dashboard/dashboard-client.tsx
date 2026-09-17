"use client";

import { ChevronLeft, ChevronRight, RefreshCw, Search, SlidersHorizontal, ArchiveRestore, Clock, Download, Copy, Fingerprint, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { ISSUE_FILTERS } from "@/lib/constants";

const statusFilters = [
  { value: "", label: "All Statuses" },
  { value: "FILED", label: "Filed" },
  { value: "NOT_FILED", label: "Not Filed" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "ERROR", label: "Error" }
];

const remarksFilters = [
  { value: "", label: "All Remarks" },
  { value: "available_to_download", label: "Available to Download" },
  { value: "for_backend_restoration", label: "For Backend Restoration" },
  { value: "still_in_process", label: "Still in Process" },
  { value: "potential_duplicate", label: "Potential Duplicate" },
  { value: "biometrics_issue", label: "Biometrics Issue" },
  { value: "authentication_failed", label: "Authentication Failed" },
];

type RemarksBadge = {
  label: string;
  bg: string;
  color: string;
};

function getRemarksBadges(packet: PacketRow): RemarksBadge[] {
  const badges: RemarksBadge[] = [];
  const tags = packet.matrixTags || [];
  const r = (packet.latestMatrixReply || "").toLowerCase();

  const isAvailable = tags.includes("available_to_download") || r.includes("available to download") || r.includes("available for download");

  if (isAvailable) {
    badges.push({ label: "Available to Download", bg: "#dcfce7", color: "#166534" });
  } else {
    if (tags.includes("for_backend_restoration") || packet.restorationCommented || packet.restorationUploaded || r.includes("backend restoration") || r.includes("for backend restoration")) {
      badges.push({ label: "For Backend Restoration", bg: "#ffedd5", color: "#9a3412" });
    }
    if (tags.includes("still_in_process") || r.includes("still processing on the backend") || r.includes("still in process") || r.includes("awaiting") || r.includes("still processing")) {
      badges.push({ label: "Still in Process", bg: "#dbeafe", color: "#1e40af" });
    }
  }
    
  if (tags.includes("potential_duplicate") || r.includes("potential duplicate") || r.includes("duplicate match") || r.includes("identified with a potential duplicate"))
    badges.push({ label: "Potential Duplicate", bg: "#f3e8ff", color: "#6b21a8" });
    
  if (tags.includes("biometrics_issue") || r.includes("biometrics") || r.includes("biometric"))
    badges.push({ label: "Biometrics Issue", bg: "#fef9c3", color: "#854d0e" });
    
  if (tags.includes("authentication_failed") || r.includes("individual authentication") || r.includes("authentication was unsuccessful"))
    badges.push({ label: "Authentication Failed", bg: "#ffe4e6", color: "#9f1239" });

  // Deduplicate
  return badges.filter((b, index, self) => index === self.findIndex(t => t.label === b.label));
}

function matchesRemarksFilter(packet: PacketRow, filter: string): boolean {
  if (!filter) return true;
  
  const r = (packet.latestMatrixReply || "").toLowerCase();
  const tags = packet.matrixTags || [];
  const isAvailable = tags.includes("available_to_download") || r.includes("available to download") || r.includes("available for download");
  
  if (filter === "available_to_download") return isAvailable;
  if (isAvailable) {
    if (filter === "for_backend_restoration" || filter === "still_in_process") return false;
  }
  
  if (filter === "for_backend_restoration") {
    return tags.includes("for_backend_restoration") || packet.restorationCommented || packet.restorationUploaded || r.includes("backend restoration") || r.includes("for backend restoration");
  }
  
  if (tags.includes(filter)) return true;
  
  // fallback for older data
  switch (filter) {
    case "still_in_process": return r.includes("still processing on the backend") || r.includes("still in process") || r.includes("awaiting") || r.includes("still processing");
    case "potential_duplicate": return r.includes("potential duplicate") || r.includes("duplicate match") || r.includes("identified with a potential duplicate");
    case "biometrics_issue": return r.includes("biometrics") || r.includes("biometric");
    case "authentication_failed": return r.includes("individual authentication") || r.includes("authentication was unsuccessful");
    default: return true;
  }
}



const PAGE_SIZE = 100;

type PacketRow = {
  id: string;
  normalizedPacketCode: string;
  issueCategory: string | null;
  proLptFolder: string;
  syncStatus: string;
  statusLabel: string;
  ticketNumber: string | null;
  latestMatrixReply: string | null;
  latestMatrixReplyDate: string | null;
  matrixTags: string[];
  restorationUploaded: boolean;
  restorationCommented: boolean;
  requiredInitialTrn: string | null;
  latestMatrixReplyAuthor: string | null;
  lastCheckedAt: string | null;
};


type PacketResponse = {
  packets: PacketRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  counts: {
    total: number;
    filed: number;
    notFiled: number;
    needsReview: number;
    withLatestReply: number;
    errors: number;
    pendingFilingRequests?: number;
    totalTicketsFiled?: number;
    forBackendRestoration?: number;
    stillInProcess?: number;
    availableToDownload?: number;
    potentialDuplicate?: number;
    biometricsIssue?: number;
    authenticationFailed?: number;
  };
  lastSyncedAt: string | null;
};

const emptyResponse: PacketResponse = {
  packets: [],
  pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
  counts: { total: 0, filed: 0, notFiled: 0, needsReview: 0, withLatestReply: 0, errors: 0, pendingFilingRequests: 0, totalTicketsFiled: 0, forBackendRestoration: 0, stillInProcess: 0, availableToDownload: 0, potentialDuplicate: 0, biometricsIssue: 0, authenticationFailed: 0 },
  lastSyncedAt: null
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not synced";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function DashboardClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();

  // Filters — these reset the page when changed
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("");
  const [remarksFilter, setRemarksFilter] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PacketResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  // Debounce search input: wait 300ms after the user stops typing before applying
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1); // reset to first page on new search
    }, 300);
  }

  // Reset page when filter dropdowns change
  function handleCategoryChange(value: string) {
    setCategory(value);
    setPage(1);
  }
  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category !== "All") params.set("category", category);
    if (status) params.set("status", status);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [category, search, status, page]);

  const loadPackets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/packets?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load packets.");
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load packets.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadPackets();
  }, [loadPackets]);

  // SSE stream: refresh data when a sync event is received
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("sync", () => {
      void loadPackets();
    });
    events.onerror = () => events.close();
    return () => events.close();
  }, [loadPackets]);

  async function syncNow() {
    setSyncing(true);
    setError("");
    try {
      const response = await fetch("/api/sync/full", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Sync failed.");
      }
      await loadPackets();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const { pagination, counts } = data;
  const rowStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rowEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);

  const mainKpis = [
    { label: "Total Packets", value: counts.total },
    { label: "Filed in Ticket", value: counts.filed },
    { label: "With Latest Reply", value: counts.withLatestReply },
    { label: "Pending Filing", value: counts.pendingFilingRequests ?? 0 },
    { label: "Total Filed", value: counts.totalTicketsFiled ?? 0 }
  ];

  const tagKpis = [
    { label: "For Backend Restoration", value: counts.forBackendRestoration ?? 0, color: "#d97706", icon: <ArchiveRestore size={16} /> },
    { label: "Still in Process", value: counts.stillInProcess ?? 0, color: "#2563eb", icon: <Clock size={16} /> },
    { label: "Available to Download", value: counts.availableToDownload ?? 0, color: "#16a34a", icon: <Download size={16} /> },
    { label: "Potential Duplicate", value: counts.potentialDuplicate ?? 0, color: "#ea580c", icon: <Copy size={16} /> },
    { label: "Biometrics Issue", value: counts.biometricsIssue ?? 0, color: "#dc2626", isError: true, icon: <Fingerprint size={16} /> },
    { label: "Authentication Failed", value: counts.authenticationFailed ?? 0, color: "#991b1b", isError: true, icon: <UserX size={16} /> }
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Live Monitoring Board</h1>
          <p className="page-kicker">Last synced: {formatDate(data.lastSyncedAt)}</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={syncNow} disabled={syncing} title="Sync now">
            <RefreshCw size={16} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        )}
      </header>

      <section className="kpi-grid primary-grid" aria-label="Packet counts">
        {mainKpis.map((kpi) => (
          <div className="kpi-card" key={kpi.label}>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
          </div>
        ))}
      </section>

      <section className="kpi-grid secondary-grid" aria-label="Tag counts">
        {tagKpis.map((kpi) => {
          const isActive = kpi.value > 0;
          return (
            <div 
              className="kpi-card" 
              key={kpi.label} 
              style={{ 
                backgroundColor: isActive ? `${kpi.color}10` : "var(--surface)",
                borderColor: isActive ? `${kpi.color}40` : "var(--border)"
              }}
            >
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", backgroundColor: isActive ? kpi.color : "transparent" }} />
              <div className="kpi-label" style={{ color: isActive && kpi.isError ? "var(--foreground)" : "var(--muted)" }}>
                <span style={{ color: isActive ? kpi.color : "var(--muted)", display: "flex" }}>
                  {kpi.icon}
                </span>
                {kpi.label}
              </div>
              <div className="kpi-value">{kpi.value}</div>
            </div>
          );
        })}
      </section>

      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <input
          id="dashboard-search"
          className="input search-input"
          value={searchInput}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search packet code or name"
          style={{ flex: "1", minWidth: "200px" }}
        />
        <select
          id="dashboard-category-filter"
          className="select"
          value={category}
          onChange={(event) => handleCategoryChange(event.target.value)}
        >
          {ISSUE_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {filter}
            </option>
          ))}
        </select>
        <select
          id="dashboard-status-filter"
          className="select"
          value={status}
          onChange={(event) => handleStatusChange(event.target.value)}
        >
          {statusFilters.map((sf) => (
            <option key={sf.value} value={sf.value}>
              {sf.label}
            </option>
          ))}
        </select>
        <select
          id="dashboard-remarks-filter"
          className="select"
          value={remarksFilter}
          onChange={(event) => { setRemarksFilter(event.target.value); setPage(1); }}
        >
          {remarksFilters.map((rf) => (
            <option key={rf.value} value={rf.value}>
              {rf.label}
            </option>
          ))}
        </select>
        <button className="btn btn-outline" onClick={loadPackets} disabled={loading} style={{ height: "36px", display: "flex", alignItems: "center", gap: "6px" }}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Packets</h2>
          <div className="pagination-info muted">
            {loading
              ? "Loading…"
              : pagination.total === 0
                ? "No packets found"
                : `${rowStart}–${rowEnd} of ${pagination.total.toLocaleString()}`}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>Packet</th>
                <th style={{ width: "18%" }}>Status</th>
                <th style={{ width: "16%" }}>Ticket Number</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {data.packets.filter(packet => matchesRemarksFilter(packet, remarksFilter)).map((packet) => {
                const badges = getRemarksBadges(packet);
                return (
                <tr
                  key={packet.id}
                  className="clickable-row"
                  onClick={() => router.push(`/packets/${packet.id}`)}
                  title="Open packet details"
                >
                  <td>
                    <strong className="mono">{packet.requiredInitialTrn || packet.normalizedPacketCode}</strong>
                    {packet.requiredInitialTrn && (
                      <div className="muted" style={{ fontSize: "0.75rem", marginTop: "2px" }}>
                        Original: {packet.normalizedPacketCode}
                      </div>
                    )}
                    <div className="muted">{packet.issueCategory ?? "Unspecified"}</div>
                    {packet.proLptFolder ? (
                      <div className="muted" style={{ fontSize: "0.75rem", marginTop: "4px" }}>
                        <span style={{ border: "1px solid currentColor", padding: "2px 6px", borderRadius: "4px" }}>
                          {packet.proLptFolder}
                        </span>
                      </div>
                    ) : null}
                    {badges.length > 0 && (
                      <div style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {badges.map(b => (
                          <span key={b.label} style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            backgroundColor: b.bg,
                            color: b.color
                          }}>
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={packet.syncStatus} label={packet.statusLabel} />
                  </td>
                  <td className="mono">{packet.ticketNumber ?? "—"}</td>
                  <td className="remarks-cell">
                    {packet.latestMatrixReply ? (
                      <>
                        {packet.latestMatrixReply}
                        {packet.latestMatrixReplyAuthor ? (
                          <div className="muted">By {packet.latestMatrixReplyAuthor}</div>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">No relevant reply</span>
                    )}
                  </td>
                </tr>
                );
              })}
              {!loading && data.packets.filter(p => matchesRemarksFilter(p, remarksFilter)).length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No packets match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {pagination.totalPages > 1 ? (
          <div className="pagination-bar">
            <button
              className="btn btn-ghost pagination-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              title="Previous page"
            >
              <ChevronLeft size={16} />
              Prev
            </button>
            <span className="pagination-pages muted">
              Page {pagination.page} of {pagination.totalPages.toLocaleString()}
            </span>
            <button
              className="btn btn-ghost pagination-btn"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages || loading}
              title="Next page"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
