import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const keys = {
  watchSet: 'fz:windows:watch',
  gameFlags: (eventId: string) => `fz:game:${eventId}:flags`,
  lastPlayId: (eventId: string) => `fz:game:${eventId}:lastPlayId`,
  cooldowns: 'fz:cooldowns',
  players: (eventId: string) => `fz:game:${eventId}:players`,
  possessionState: (eventId: string) => `fz:game:${eventId}:possession`,
  teamCurrentGame: (teamId: string) => `fz:team:${teamId}:current_game`,
  // Disco simulation keys
  discoEnabled: 'fz:disco:enabled',
  discoLastHeartbeat: 'fz:disco:last_heartbeat',
  discoCycleUntil: 'fz:disco:cycle_until',
  discoGames: 'fz:disco:games',
};

