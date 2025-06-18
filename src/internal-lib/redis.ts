import Redis from "ioredis";

declare global {
    var redis: Redis | undefined;
}

let redis: Redis;

{
    if (!global.redis) {
        global.redis = new Redis(process.env.REDIS_URL!);
    }
    redis = global.redis;
}

redis.on("error", (err) => {
    console.error("Redis Client Error", err);
});

export function createRedisConnection() {
    const localRedis = new Redis(process.env.REDIS_URL!);
    return localRedis;
}

export const USER_SETTINGS_KEY = (userId: string) => `user:${userId}:settings`;
export const USER_CHATS_KEY = (userId: string) => `user:${userId}:chats`;
export const USER_CHATS_INDEX_KEY = (userId: string) => `user:${userId}:chat-index`;
export const USER_FILES_KEY = (chatId: string) => `chats:${chatId}:files`;
export const CHAT_GENERATING_KEY = (chatId: string) => `chats:${chatId}:generating`;
export const CHAT_MESSAGES_KEY = (chatId: string) => `chats:${chatId}:messages`;
export const GET_LOOKUP_KEY = (userId: string, chatId: string | null, originalName: string) => `USER_FILE_LOOKUP:${userId}:${chatId}:${originalName}`;
export const MESSAGE_STREAM_KEY = (chatId: string) => `message-stream:${chatId}`;

export default redis;

