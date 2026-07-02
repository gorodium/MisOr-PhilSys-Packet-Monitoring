import { PacketSyncStatus } from "@prisma/client";

export const ISSUE_FILTERS = [
  "All",
  "Not Generated",
  "Data Usage Expired",
  "RINF",
  "Unclickable",
  "Updating Issue"
] as const;

export const PACKET_STATUSES = [
  PacketSyncStatus.FILED,
  PacketSyncStatus.NOT_FILED,
  PacketSyncStatus.NEEDS_REVIEW,
  PacketSyncStatus.ERROR
] as const;

export const STATUS_LABELS: Record<PacketSyncStatus, string> = {
  [PacketSyncStatus.PENDING]: "Pending",
  [PacketSyncStatus.FILED]: "Filed",
  [PacketSyncStatus.NOT_FILED]: "Not Filed",
  [PacketSyncStatus.NEEDS_REVIEW]: "Needs Review",
  [PacketSyncStatus.ERROR]: "Error"
};

export const DEFAULT_TICKET_TEMPLATE =
  "Good day.\n\nPlease check the following PhilSys data packet:\n\nPacket: {{packetCode}}\nConcern Type: {{issueCategory}}\n\nThis packet was detected from the monitoring board and has not yet been filed in an existing Matrix ticket.\n\nThank you.";

