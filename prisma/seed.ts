import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { Role } from '../src/common/enums/role.enum';
import { Logger } from '@nestjs/common';

const prisma = new PrismaClient();
const logger = new Logger('prisma-seed');
async function seed() {
  const adminEmail = 'a@b.com';
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing) {
    logger.warn('Admin user already exists');
    process.exit(0);
  }

  const hash = await argon2.hash('123456');

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      fullName: 'Super Admin',
      role: Role.ADMIN,
      passwordHash: hash,
      territory: null,
    },
  });

  logger.log(`Admin user created: ${admin.email}`);
  process.exit(0);
}

seed().catch((err) => {
  logger.error(
    'Seed failed:',
    (err as unknown) instanceof Error ? (err as Error).message : String(err)
  );
  process.exit(1);
});
