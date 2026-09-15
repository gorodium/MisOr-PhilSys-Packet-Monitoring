import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = "admin";
  // The user told me before their password was Pri$oner201131460, but let's just make it that.
  const adminPassword = "changeme_admin";

  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername }
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash,
        role: "ADMIN",
        forcePasswordChange: true
      }
    });
    console.log(`Created admin user '${adminUsername}' with password '${adminPassword}'`);
  } else {
    console.log(`Admin user '${adminUsername}' already exists.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
