import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../../utils/redisClient.js";

const GLOBAL_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS || "60000", 10);
const GLOBAL_MAX = parseInt(process.env.RATE_GLOBAL_MAX || "200", 10);

export const globalLimiter = rateLimit({
  windowMs: GLOBAL_WINDOW_MS,
  max: GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
});
