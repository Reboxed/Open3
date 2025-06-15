import Redis from 'ioredis';

declare global {
  var redis: Redis | undefined;
}

let redis: Redis;

if (process.env.NODE_ENV === 'production') {
  redis = new Redis(process.env.REDIS_URL!);
} else {
  if (!global.redis) {
    global.redis = new Redis(process.env.REDIS_URL!);
  }
  redis = global.redis;
}

redis.on('error', (err) => {
  console.error('Redis Client Error', err);
});

export const USER_SETTINGS_KEY = (userId: string) => `user:${userId}:settings`;
export const USER_CHATS_KEY = (userId: string) => `user:${userId}:chats`;
export const USER_CHATS_INDEX_KEY = (userId: string) => `user:${userId}:chat-index`;
export const MESSAGES_KEY  = (chatId: string) => `chats:${chatId}:messages`;

export default redis;

