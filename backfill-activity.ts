import { prisma } from "./src/lib/prisma";

async function backfill() {
  console.log("Starting backfill of activity logs...");

  // 1. Backfill Filing Requests
  const requests = await prisma.matrixFilingRequest.findMany({
    include: { user: true },
  });
  
  let reqCount = 0;
  for (const req of requests) {
    if (req.user) {
      await prisma.activityLog.create({
        data: {
          type: "FILING_REQUEST",
          actor: req.user.username,
          message: `${req.user.username} filed a request for ${req.actionType} — TRN ${req.trn}`,
          metadata: { trn: req.trn, tracker: req.actionType, requestId: req.id },
          createdAt: req.createdAt,
        }
      });
      reqCount++;
    }
  }
  console.log(`Backfilled ${reqCount} Filing Requests`);

  // 2. Backfill Matrix Replies
  const packetsWithReplies = await prisma.packet.findMany({
    where: { latestMatrixReply: { not: null }, latestMatrixReplyAuthor: { not: null }, latestMatrixReplyDate: { not: null } }
  });

  let replyCount = 0;
  for (const packet of packetsWithReplies) {
    const body = packet.latestMatrixReply;
    const excerpt = body!.length > 50 ? body!.substring(0, 50) + "..." : body;
    await prisma.activityLog.create({
      data: {
        type: "MATRIX_REPLY",
        actor: packet.latestMatrixReplyAuthor!,
        message: `${packet.latestMatrixReplyAuthor} replied to Ticket #${packet.ticketNumber}: "${excerpt}"`,
        metadata: { ticketNumber: packet.ticketNumber, trn: packet.normalizedPacketCode },
        createdAt: packet.latestMatrixReplyDate!,
      }
    });
    replyCount++;
  }
  console.log(`Backfilled ${replyCount} Matrix Replies`);

  console.log("Backfill complete.");
}

backfill()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
