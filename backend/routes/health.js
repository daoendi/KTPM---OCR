import express from "express";
import { redisClient } from "../utils/redisClient.js";
import { getCacheStats } from "../utils/cacheStats.js";
import { getBreakersReport } from "../utils/circuitBreaker.js";

const router = express.Router();

// GET /health - simple health check including Redis connectivity
router.get("/health", async (req, res) => {
  try {
    // Prefer an active PING; redisClient.ping() returns 'PONG' on success
    let ok = false;
    try {
      const pong = await redisClient.ping();
      ok = Boolean(pong);
    } catch (e) {
      // ping may not be supported by some clients or could throw
      ok = !!redisClient.isOpen;
    }

    if (!ok) {
      console.error("Health check: Redis not available");
      const cacheStats = getCacheStats();
      const breakers = getBreakersReport();
      return res
        .status(500)
        .json({ healthy: false, redis: false, cacheStats, breakers });
    }

    const cacheStats = getCacheStats();
    const breakers = getBreakersReport();
    return res.json({ healthy: true, redis: true, cacheStats, breakers });
  } catch (error) {
    console.error("Health endpoint error:", error);
    return res
      .status(500)
      .json({ healthy: false, error: String(error?.message || error) });
  }
});

export default router;
