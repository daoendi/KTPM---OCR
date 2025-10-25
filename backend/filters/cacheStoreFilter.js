import { redisClient } from "../utils/redisClient.js";

const CACHE_TTL = process.env.CACHE_TTL || 3600; // 1 hour in seconds

/**
 * Filter to store the final result in the cache.
 * This should be the last filter in the pipeline.
 *
 * @param {object} ctx - The context object.
 * @property {string} [ctx.cacheKey] - The key to use for caching.
 * @property {boolean} [ctx.fromCache] - Flag indicating if the result was from cache.
 * @returns {Promise<object>} - The unmodified context.
 */
export async function CacheStoreFilter(ctx) {
  // Only write to cache if a key is present and it wasn't a cache hit
  if (ctx.cacheKey && !ctx.fromCache) {
    try {
      const cacheData = {
        text: ctx.text,
        translated: ctx.translated,
        mime: ctx.mime,
        filename: ctx.filename,
        // Buffers must be converted to a string format like base64 for JSON serialization
        output: ctx.output.toString("base64"),
      };

      // Set the cache with an expiration time
      await redisClient.set(
        ctx.cacheKey,
        JSON.stringify(cacheData),
        "EX",
        CACHE_TTL
      );
      //console.log(`Cache SET: ${ctx.cacheKey} with TTL ${CACHE_TTL}s`);
    } catch (err) {
      console.error("Failed to write to cache:", err);
    }
  }
  return ctx;
}
