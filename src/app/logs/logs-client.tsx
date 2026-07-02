"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";

type SyncLog = {
  id: string;
  syncType: string;
  status: string;
  message: string;
  startedAt: string;
  finishedAt: string | null;
};

type AutomationRun = {
  id: string;
  runType: string;
  status: string;
  packetsScanned: number;
  ticketsCreated: number;
  repliesSynced: number;
  startedAt: string;
  finishedAt: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  status: string;
  actor: string | null;
  message: string;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Open";
  }
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function LogsClient() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadLogs() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/logs", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load logs.");
      }
      setSyncLogs(payload.syncLogs);
      setAutomationRuns(payload.automationRuns);
      setAuditLogs(payload.auditLogs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Logs</h1>
          <p className="page-kicker">{loading ? "Loading" : "Sync, automation, and audit events"}</p>
        </div>
        <button className="btn" onClick={loadLogs} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error ? <div className="alert error-text">{error}</div> : null}

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-header">
          <h2 className="panel-title">Sync Logs</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Message</th>
                <th>Started</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.syncType}</td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td>{log.message}</td>
                  <td>{formatDate(log.startedAt)}</td>
                  <td>{formatDate(log.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-header">
          <h2 className="panel-title">Automation Runs</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Packets</th>
                <th>Tickets</th>
                <th>Replies</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {automationRuns.map((run) => (
                <tr key={run.id}>
                  <td>{run.runType}</td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>{run.packetsScanned}</td>
                  <td>{run.ticketsCreated}</td>
                  <td>{run.repliesSynced}</td>
                  <td>{formatDate(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Audit Logs</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Status</th>
                <th>Actor</th>
                <th>Message</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.action}</td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td>{log.actor ?? "system"}</td>
                  <td>{log.message}</td>
                  <td>{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

