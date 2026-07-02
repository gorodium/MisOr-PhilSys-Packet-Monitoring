import { MatrixReply, MatrixTicketRecord } from "@/lib/matrix/types";

export const demoSheetRows = [
  {
    Packet: "PSN 2026-001",
    "Issue Category": "Not Generated",
    Office: "NCR",
    Notes: "Initial monitoring row"
  },
  {
    Packet: "psn-2026-002",
    "Issue Category": "Data Usage Expired",
    Office: "Region III",
    Notes: "Has one existing ticket"
  },
  {
    Packet: "PSN / 2026 / 003",
    "Issue Category": "RINF",
    Office: "Region IV-A",
    Notes: "Appears in two Matrix tickets"
  },
  {
    Packet: "PSN 2026 004",
    "Issue Category": "Unclickable",
    Office: "Region VII",
    Notes: "Reply pending"
  },
  {
    Packet: "PSN-2026-005",
    "Issue Category": "Updating Issue",
    Office: "Region XI",
    Notes: "Filed with latest reply"
  }
];

export const demoReplies: Record<string, MatrixReply[]> = {
  "matrix-demo-1002": [
    {
      id: "reply-1002-1",
      body: "PSN-2026-002 was validated. Please retry generation after the cache refresh.",
      author: "Matrix Support",
      createdAt: new Date("2026-06-29T02:35:00.000Z")
    }
  ],
  "matrix-demo-1003-a": [
    {
      id: "reply-1003-a-1",
      body: "Checking PSN/2026/003 against RINF records.",
      author: "Matrix Support",
      createdAt: new Date("2026-06-28T08:12:00.000Z")
    }
  ],
  "matrix-demo-1003-b": [
    {
      id: "reply-1003-b-1",
      body: "Duplicate concern noted for PSN/2026/003. Needs owner confirmation.",
      author: "Matrix Support",
      createdAt: new Date("2026-06-30T04:20:00.000Z")
    }
  ],
  "matrix-demo-1005": [
    {
      id: "reply-1005-1",
      body: "PSN-2026-005 update is in progress.",
      author: "Matrix Support",
      createdAt: new Date("2026-06-30T09:30:00.000Z")
    },
    {
      id: "reply-1005-2",
      body: "PSN-2026-005 has been corrected and is ready for verification.",
      author: "Matrix Lead",
      createdAt: new Date("2026-07-01T01:15:00.000Z")
    }
  ]
};

export const demoTickets: MatrixTicketRecord[] = [
  {
    matrixTicketId: "matrix-demo-1002",
    ticketNumber: "MTX-1002",
    title: "Data usage expired for PSN-2026-002",
    body: "Packet PSN-2026-002 cannot proceed because data usage has expired.",
    status: "Open",
    author: "Monitoring Desk",
    createdAtMatrix: new Date("2026-06-28T10:00:00.000Z"),
    updatedAtMatrix: new Date("2026-06-29T02:35:00.000Z"),
    rawData: { source: "demo" }
  },
  {
    matrixTicketId: "matrix-demo-1003-a",
    ticketNumber: "MTX-1003",
    title: "RINF validation PSN/2026/003",
    body: "RINF validation request for PSN/2026/003.",
    status: "Open",
    author: "Monitoring Desk",
    createdAtMatrix: new Date("2026-06-28T07:40:00.000Z"),
    updatedAtMatrix: new Date("2026-06-28T08:12:00.000Z"),
    rawData: { source: "demo" }
  },
  {
    matrixTicketId: "matrix-demo-1003-b",
    ticketNumber: "MTX-1004",
    title: "Follow-up for PSN/2026/003",
    body: "Second ticket mentioning PSN/2026/003. This should force review.",
    status: "Open",
    author: "Monitoring Desk",
    createdAtMatrix: new Date("2026-06-30T03:50:00.000Z"),
    updatedAtMatrix: new Date("2026-06-30T04:20:00.000Z"),
    rawData: { source: "demo" }
  },
  {
    matrixTicketId: "matrix-demo-1005",
    ticketNumber: "MTX-1005",
    title: "Updating issue for PSN-2026-005",
    body: "Please check updating issue for Packet: PSN-2026-005.",
    status: "Open",
    author: "Monitoring Desk",
    createdAtMatrix: new Date("2026-06-29T06:00:00.000Z"),
    updatedAtMatrix: new Date("2026-07-01T01:15:00.000Z"),
    rawData: { source: "demo" }
  }
];

