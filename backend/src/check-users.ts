import { prisma } from './lib/prisma';

async function main() {
  const users = await prisma.user.findMany();
  console.log("Users in Database:");
  users.forEach(u => {
    console.log(`- ID: ${u.id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, isVerified: ${u.isVerified}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
