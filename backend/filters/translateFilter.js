import { translateText } from "../utils/translate.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const CACHE_TTL = process.env.CACHE_TTL || 3600;

/**
 * Filter để dịch văn bản, có cache
 * @param {object} ctx - Context pipeline
 * @returns {Promise<object>} - Context đã cập nhật
 */
export async function TranslateFilter(ctx) {
  if (!ctx.text || ctx.text.trim() === "") return ctx;

  // Tạo cache key dựa trên imageId và ngôn ngữ đích
  const cacheKey = `translation:${ctx.imageId}:${ctx.targetLang}`;

  // Kiểm tra cache
  const cachedTranslation = await redisClient.get(cacheKey);
  if (cachedTranslation) {
    //console.log(`[Cache HIT] Translate: ${cacheKey}`);
    recordHit("translate");
    ctx.translated = cachedTranslation;
    ctx.detectedLang = "auto";
    return ctx;
  }

  //console.log(`[Cache MISS] Translate: ${cacheKey}`);
  recordMiss("translate");

  // Nếu không có cache, gọi API dịch
  try {
    ctx.translated = await translateText(ctx.text, ctx.targetLang);
    ctx.detectedLang = "auto";

    // Lưu kết quả vào cache
    await redisClient.set(cacheKey, ctx.translated, "EX", CACHE_TTL);
  } catch (e) {
    console.error("Translate error:", e.message);
    ctx.translated = ctx.text; // Fallback to original text
    ctx.detectedLang = "unknown";
  }

  return ctx;
}
