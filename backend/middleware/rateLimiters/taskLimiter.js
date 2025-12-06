import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../../utils/redisClient.js";

export const createTaskLimiter = (prefix, maxPerMin) => {
  const envKey = `RATE_${String(prefix).toUpperCase()}_MAX`;
  const max = parseInt(process.env[envKey] || String(maxPerMin), 10);
  const windowMs = parseInt(process.env.RATE_WINDOW_MS || "60000", 10);
  return rateLimit({
    windowMs,
    max,
    // Prefer authenticated user id when available, fall back to IP
    keyGenerator: (req) => `${prefix}:${req.user?.sub || req.ip}`,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
  });
};
