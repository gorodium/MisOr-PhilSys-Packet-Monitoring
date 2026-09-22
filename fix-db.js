const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const res = await prisma.matrixFilingRequest.updateMany({
    where: { actionType: 'Not Updating' },
    data: { actionType: 'ePhilID TRN Concerns' },
  });
  console.log('Updated records:', res.count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
