import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../utils/redisClient.js";

export const limiter = rateLimit({
  windowMs: 60 * 1000, // 60s
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args)
  })
});
