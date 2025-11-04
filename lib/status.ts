import { redis, keys } from '@/lib/redis';

export type GlobalStatus = {
  eventId: string | null;
  channel: string | null;
  holdUntil: string | null;
  cooldownUntil: string | null;
};

export async function computeGlobalStatus(): Promise<GlobalStatus> {
  const watch = await redis.smembers<string>(keys.watchSet);
  let chosen: string | null = null;
  for (const eventId of watch) {
    const flags = await redis.get<Record<string, any>>(keys.gameFlags(eventId));
    if (flags?.inRedZone || flags?.goalToGo) {
      chosen = eventId;
      break;
    }
  }
  const cooldown = (await redis.get<{ until?: string }>(keys.cooldowns)) || {};
  return {
    eventId: chosen,
    channel: chosen ? 'NFL RedZone' : null,
    holdUntil: null,
    cooldownUntil: cooldown.until ?? null,
  };
}

