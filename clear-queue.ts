import { prisma } from './src/lib/prisma';
async function run() {
  const refiles = await prisma.activityLog.findMany({ where: { type: 'REFILE' } });
  let cleared = 0;
  for (const refile of refiles) {
    if (refile.metadata?.packetId) {
      await prisma.packet.update({
        where: { id: refile.metadata.packetId },
        data: {
          latestMatrixReply: null,
          latestMatrixReplyAuthor: null,
          latestMatrixReplyDate: null,
          syncStatus: 'FILED'
        }
      });
      cleared++;
    }
  }
  console.log(`Cleared ${cleared} packets from the wrong tracker queue.`);
}
run();
