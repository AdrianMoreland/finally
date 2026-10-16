import { config } from 'dotenv';
import { createPrismaClient, provisionDefaults } from '../src/index.ts';

config({ path: '../../.env', quiet: true });

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const email = (process.env['ALLOWED_EMAILS'] ?? '').split(',')[0]?.trim().toLowerCase();
if (!email) throw new Error('ALLOWED_EMAILS is not set');

const db = createPrismaClient(url);

try {
  // The demo user's authId is replaced with the Supabase user id on first sign-in (matched by email).
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      authId: `pending:${email}`,
      displayName: 'Demo',
      paydayDayOfMonth: 25,
    },
  });
  const defaults = await provisionDefaults(db, user.id);
  console.log(`Seeded ${email}:`, defaults);
} finally {
  await db.$disconnect();
}
