import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../../utils/redisClient.js";

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,            // 1 phút
  max: 200,                       // tối đa 200 request / phút / IP
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
});
