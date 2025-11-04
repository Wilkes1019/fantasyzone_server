import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';
import { flags } from '@/lib/env';

export const espnLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(flags.espnMaxRps, '1 s'),
  prefix: 'rl:espn',
});

export function jitterMs(ms: number, ratio = 0.15): number {
  const delta = ms * ratio;
  return Math.max(0, Math.round(ms + (Math.random() * 2 - 1) * delta));
}

export const watchLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, '1 s'),
  prefix: 'rl:watch',
});

export function getClientIp(req: Request): string {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim();
  const real = req.headers.get('x-real-ip') || '';
  return fwd || real || 'unknown';
}

