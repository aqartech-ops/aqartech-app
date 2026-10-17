// Reset a PLATFORM ADMIN password from the server computer (no email needed).
// Usage:  npm run admin:reset-password -- admin@aqartech.om "New-Strong-Password"
// Signs that admin out of every device.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage: npm run admin:reset-password -- <email> "<new password, min 10 chars>"');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const admin = await prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!admin) {
    console.error(`No platform admin with email ${email}`);
    process.exit(1);
  }
  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date(), isActive: true },
  });
  console.log(`✔ Password reset for ${admin.email}`);
} finally {
  await prisma.$disconnect();
}
