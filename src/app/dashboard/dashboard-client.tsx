"use client";

import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";

const issueFilters = ["All", "Not Generated", "Data Usage Expired", "RINF", "Unclickable", "Updating Issue"];
const statusFilters = [
  { value: "", label: "All Statuses" },
  { value: "FILED", label: "Filed" },
  { value: "NOT_FILED", label: "Not Filed" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "ERROR", label: "Error" }
];

type PacketRow = {
  id: string;
  normalizedPacketCode: string;
  issueCategory: string | null;
  syncStatus: string;
  statusLabel: string;
  ticketNumber: string | null;
  latestMatrixReply: string | null;
  latestMatrixReplyAuthor: string | null;
  lastCheckedAt: string | null;
};

type PacketResponse = {
  packets: PacketRow[];
  counts: {
    total: number;
    filed: number;
    notFiled: number;
    needsReview: number;
    withLatestReply: number;
    errors: number;
  };
  lastSyncedAt: string | null;
};

const emptyResponse: PacketResponse = {
  packets: [],
  counts: {
    total: 0,
    filed: 0,
    notFiled: 0,
    needsReview: 0,
    withLatestReply: 0,
    errors: 0
  },
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

export function DashboardClient() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<PacketResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) {
      params.set("search", search);
    }
    if (category !== "All") {
      params.set("category", category);
    }
    if (status) {
      params.set("status", status);
    }
    return params.toString();
  }, [category, search, status]);

  const loadPackets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/packets${query ? `?${query}` : ""}`, { cache: "no-store" });
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

  const kpis = [
    ["Total Packets", data.counts.total],
    ["Filed in Ticket", data.counts.filed],
    ["Not Filed", data.counts.notFiled],
    ["Needs Review", data.counts.needsReview],
    ["With Latest Reply", data.counts.withLatestReply],
    ["Sync Errors", data.counts.errors]
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Live Monitoring Board</h1>
          <p className="page-kicker">Last synced: {formatDate(data.lastSyncedAt)}</p>
        </div>
        <button className="btn btn-primary" onClick={syncNow} disabled={syncing} title="Sync now">
          <RefreshCw size={16} />
          {syncing ? "Syncing" : "Sync Now"}
        </button>
      </header>

      <section className="kpi-grid" aria-label="Packet counts">
        {kpis.map(([label, value]) => (
          <div className="kpi-card" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </section>

      <div className="toolbar">
        <div className="toolbar-group">
          <Search size={16} className="muted" />
          <input
            className="input search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search packet code"
          />
        </div>
        <div className="toolbar-group">
          <SlidersHorizontal size={16} className="muted" />
          <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
            {issueFilters.map((filter) => (
              <option key={filter} value={filter}>
                {filter}
              </option>
            ))}
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={loadPackets} disabled={loading} title="Refresh table">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Packets</h2>
          <span className="muted">{loading ? "Loading" : `${data.packets.length} shown`}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>Packet</th>
                <th style={{ width: "18%" }}>Status if Filed in a Ticket or Not</th>
                <th style={{ width: "16%" }}>Ticket Number</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {data.packets.map((packet) => (
                <tr
                  key={packet.id}
                  className="clickable-row"
                  onClick={() => router.push(`/packets/${packet.id}`)}
                  title="Open packet details"
                >
                  <td>
                    <strong className="mono">{packet.normalizedPacketCode}</strong>
                    <div className="muted">{packet.issueCategory ?? "Unspecified"}</div>
                  </td>
                  <td>
                    <StatusBadge status={packet.syncStatus} label={packet.statusLabel} />
                  </td>
                  <td className="mono">{packet.ticketNumber ?? "None"}</td>
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
              ))}
              {!loading && data.packets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No packets found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

