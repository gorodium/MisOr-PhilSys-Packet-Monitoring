const statusClass: Record<string, string> = {
  PENDING: "badge badge-pending",
  FILED: "badge badge-filed",
  NOT_FILED: "badge badge-not-filed",
  NEEDS_REVIEW: "badge badge-review",
  ERROR: "badge badge-error",
  SUCCESS: "badge badge-filed",
  PARTIAL: "badge badge-review",
  RUNNING: "badge badge-pending",
  SKIPPED: "badge badge-muted"
};

const labels: Record<string, string> = {
  PENDING: "Pending",
  FILED: "Filed",
  NOT_FILED: "Not Filed",
  NEEDS_REVIEW: "Needs Review",
  ERROR: "Error",
  SUCCESS: "Success",
  PARTIAL: "Partial",
  RUNNING: "Running",
  SKIPPED: "Skipped"
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={statusClass[status] ?? "badge badge-muted"}>{label ?? labels[status] ?? status}</span>;
}

