import { redisClient } from "./redisClient.js";

const METRICS_PREFIX = "metrics:";

export async function incr(metricKey, by = 1) {
  try {
    const key = `${METRICS_PREFIX}${metricKey}`;
    if (by === 1) {
      return await redisClient.incr(key);
    }
    return await redisClient.incrby(key, by);
  } catch (e) {
    console.warn("Metrics incr failed:", e?.message || e);
    return null;
  }
}

export async function get(metricKey) {
  try {
    const key = `${METRICS_PREFIX}${metricKey}`;
    const v = await redisClient.get(key);
    return v ? Number(v) : 0;
  } catch (e) {
    console.warn("Metrics get failed:", e?.message || e);
    return 0;
  }
}

export async function getAll() {
  try {
    const keys = await redisClient.keys(`${METRICS_PREFIX}*`);
    if (!keys || keys.length === 0) return {};
    const vals = await redisClient.mget(keys);
    const out = {};
    keys.forEach((k, idx) => {
      out[k.replace(METRICS_PREFIX, "")] = Number(vals[idx] || 0);
    });
    return out;
  } catch (e) {
    console.warn("Metrics getAll failed:", e?.message || e);
    return {};
  }
}

export default { incr, get, getAll };
