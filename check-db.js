const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const req = await prisma.matrixFilingRequest.findUnique({ where: { id: "cmu6cnzpx000zl304bwk10i7k" } });
  console.log("Filing request cmu6cnzpx000zl304bwk10i7k:", req);
}
main().finally(() => prisma.$disconnect());
