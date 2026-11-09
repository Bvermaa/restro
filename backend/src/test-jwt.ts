import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

async function main() {
  const email = "admin@qrrestaurant.com";
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });

  if (!user) {
    console.error("Admin user not found in DB!");
    return;
  }

  console.log("DB User:", { id: user.id, email: user.email, role: user.role });

  const tokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const secret = process.env.JWT_ACCESS_SECRET ?? 'your-super-secret-access-key-min-64-chars-change-in-production';
  const accessToken = jwt.sign(tokenPayload, secret, { expiresIn: '15m' });
  console.log("Generated Token:", accessToken);

  const decoded = jwt.verify(accessToken, secret) as typeof tokenPayload;
  console.log("Decoded Token Payload:", decoded);
}

main().catch(console.error).finally(() => prisma.$disconnect());
