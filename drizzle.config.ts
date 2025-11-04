import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load local env first if present, then fallback to default .env
dotenv.config({ path: '.env.local' });
dotenv.config();

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEON_DATABASE_URL || '',
  },
});

