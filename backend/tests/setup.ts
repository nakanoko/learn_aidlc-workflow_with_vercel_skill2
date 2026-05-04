import { afterAll, beforeAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// Use a dedicated test SQLite DB
const TEST_DB_PATH = path.resolve(__dirname, '../prisma/test.db');
process.env['DATABASE_URL'] = `file:${TEST_DB_PATH}`;
(process.env as Record<string, string>)['NODE_ENV'] = 'test';

beforeAll(() => {
  // Clean up any prior test DB
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = `${TEST_DB_PATH}${suffix}`;
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        // ignore
      }
    }
  }

  // Apply migrations to test DB
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    cwd: path.resolve(__dirname, '..'),
  });
});

beforeEach(async () => {
  // Truncate tables before each test
  const { prisma } = await import('@/lib/prisma');
  await prisma.auditLog.deleteMany();
  await prisma.invoice.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import('@/lib/prisma');
  await prisma.$disconnect();
});
