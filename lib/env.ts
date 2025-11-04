import { z } from 'zod';

const envSchema = z.object({
  NEON_DATABASE_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  ADMIN_USER: z.string().min(1).optional(),
  ADMIN_PASS: z.string().min(1).optional(),
  FZ_POLL_MS_STATUS: z.string().default('1000'),
  FZ_WATCH_WINDOW_SEC: z.string().default('20'),
  FZ_SCAN_CONCURRENCY: z.string().default('3'),
  FZ_ESPN_MAX_RPS: z.string().default('3'),
  FZ_INZONE_TTL_SEC: z.string().default('30'),
  FZ_LIVE_TTL_SEC: z.string().default('120'),
});

export const env = envSchema.parse({
  NEON_DATABASE_URL: process.env.NEON_DATABASE_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  ADMIN_USER: process.env.ADMIN_USER,
  ADMIN_PASS: process.env.ADMIN_PASS,
  FZ_POLL_MS_STATUS: process.env.FZ_POLL_MS_STATUS,
  FZ_WATCH_WINDOW_SEC: process.env.FZ_WATCH_WINDOW_SEC,
  FZ_SCAN_CONCURRENCY: process.env.FZ_SCAN_CONCURRENCY,
  FZ_ESPN_MAX_RPS: process.env.FZ_ESPN_MAX_RPS,
  FZ_INZONE_TTL_SEC: process.env.FZ_INZONE_TTL_SEC,
  FZ_LIVE_TTL_SEC: process.env.FZ_LIVE_TTL_SEC,
});

export const flags = {
  pollMsStatus: Number(env.FZ_POLL_MS_STATUS || '1000'),
  watchWindowSec: Number(env.FZ_WATCH_WINDOW_SEC || '20'),
  scanConcurrency: Number(env.FZ_SCAN_CONCURRENCY || '3'),
  espnMaxRps: Number(env.FZ_ESPN_MAX_RPS || '3'),
  inzoneTtlSec: Number(env.FZ_INZONE_TTL_SEC || '30'),
  liveTtlSec: Number(env.FZ_LIVE_TTL_SEC || '120'),
};

