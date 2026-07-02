-- CreateEnum
CREATE TYPE "PacketSyncStatus" AS ENUM ('PENDING', 'FILED', 'NOT_FILED', 'NEEDS_REVIEW', 'ERROR');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('TITLE', 'BODY', 'REPLY', 'SEARCH_RESULT', 'MANUAL');

-- CreateTable
CREATE TABLE "Packet" (
    "id" TEXT NOT NULL,
    "packetCode" TEXT NOT NULL,
    "normalizedPacketCode" TEXT NOT NULL,
    "issueCategory" TEXT,
    "sourceSheetRowNumber" INTEGER NOT NULL,
    "sourceSheetRawData" JSONB NOT NULL,
    "filedInTicket" BOOLEAN NOT NULL DEFAULT false,
    "ticketNumber" TEXT,
    "ticketId" TEXT,
    "latestMatrixReply" TEXT,
    "latestMatrixReplyAuthor" TEXT,
    "latestMatrixReplyDate" TIMESTAMP(3),
    "syncStatus" "PacketSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastCheckedAt" TIMESTAMP(3),
    "matrixTicketDbId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Packet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrixTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "matrixTicketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "author" TEXT,
    "createdAtMatrix" TIMESTAMP(3),
    "updatedAtMatrix" TIMESTAMP(3),
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrixTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPacketMatch" (
    "id" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "matrixTicketId" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "matchedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPacketMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "packetsScanned" INTEGER NOT NULL DEFAULT 0,
    "ticketsScanned" INTEGER NOT NULL DEFAULT 0,
    "ticketsCreated" INTEGER NOT NULL DEFAULT 0,
    "repliesSynced" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "role" TEXT,
    "status" "RunStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Packet_normalizedPacketCode_key" ON "Packet"("normalizedPacketCode");

-- CreateIndex
CREATE INDEX "Packet_issueCategory_idx" ON "Packet"("issueCategory");

-- CreateIndex
CREATE INDEX "Packet_syncStatus_idx" ON "Packet"("syncStatus");

-- CreateIndex
CREATE INDEX "Packet_ticketNumber_idx" ON "Packet"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MatrixTicket_ticketNumber_key" ON "MatrixTicket"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MatrixTicket_matrixTicketId_key" ON "MatrixTicket"("matrixTicketId");

-- CreateIndex
CREATE INDEX "MatrixTicket_status_idx" ON "MatrixTicket"("status");

-- CreateIndex
CREATE INDEX "MatrixTicket_updatedAtMatrix_idx" ON "MatrixTicket"("updatedAtMatrix");

-- CreateIndex
CREATE INDEX "TicketPacketMatch_packetId_idx" ON "TicketPacketMatch"("packetId");

-- CreateIndex
CREATE INDEX "TicketPacketMatch_matrixTicketId_idx" ON "TicketPacketMatch"("matrixTicketId");

-- CreateIndex
CREATE INDEX "SyncLog_syncType_idx" ON "SyncLog"("syncType");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateIndex
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_runType_idx" ON "AutomationRun"("runType");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- CreateIndex
CREATE INDEX "AutomationRun_startedAt_idx" ON "AutomationRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_status_idx" ON "AuditLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_matrixTicketDbId_fkey" FOREIGN KEY ("matrixTicketDbId") REFERENCES "MatrixTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPacketMatch" ADD CONSTRAINT "TicketPacketMatch_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "Packet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPacketMatch" ADD CONSTRAINT "TicketPacketMatch_matrixTicketId_fkey" FOREIGN KEY ("matrixTicketId") REFERENCES "MatrixTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
