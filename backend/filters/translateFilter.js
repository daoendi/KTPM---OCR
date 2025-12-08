import crypto from "crypto";
import { translateText } from "../utils/translate.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const TRANSLATE_CACHE_TTL = parseInt(
  process.env.CACHE_TRANSLATE_TTL || "604800",
  10
);

/**
 * Filter này dịch văn bản và tích hợp logic cache.
 * Nó tạo cache key dựa trên văn bản đầu vào và ngôn ngữ đích.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với văn bản đã dịch.
 */
export async function TranslateFilter(ctx) {
  if (!ctx.text || ctx.text.trim() === "" || !ctx.targetLang) {
    // Nếu không có text hoặc targetLang, không cần dịch, gán translated bằng text gốc
    ctx.translated = ctx.text;
    const baseHash =
      ctx.textHash ||
      crypto
        .createHash("sha256")
        .update(ctx.text || "")
        .digest("hex");
    ctx.translatedHash = baseHash;
    return ctx;
  }

  const textHash =
    ctx.textHash || crypto.createHash("sha256").update(ctx.text).digest("hex");
  ctx.textHash = textHash;

  const translateKey = `ocr:trans:${textHash}:${ctx.targetLang}`;

  // 2. Kiểm tra cache
  const cachedTranslation = await redisClient.get(translateKey);

  if (cachedTranslation) {
    // 3a. Cache hit
    recordHit("translate");
    try {
      const parsed = JSON.parse(cachedTranslation);
      ctx.translated = parsed.translatedText;
    } catch (err) {
      ctx.translated = cachedTranslation;
    }
    ctx.translatedHash = crypto
      .createHash("sha256")
      .update(ctx.translated || "")
      .digest("hex");
    ctx.translateFromCache = true;
    console.log("   -> Translate Cache hit.");
  } else {
    // 3b. Cache miss
    recordMiss("translate");
    try {
      const res = await translateText(ctx.text, ctx.targetLang);
      if (res && typeof res === "object" && res.cacheFallback) {
        // translateText used a cached translation as a fallback
        ctx.translated = res.translatedText;
        ctx.translateCacheFallback = true;
      } else {
        ctx.translated = res;
        ctx.translateCacheFallback = false;
      }

      // Store result in cache (if any)
      await redisClient.set(
        translateKey,
        JSON.stringify({ translatedText: ctx.translated }),
        "EX",
        TRANSLATE_CACHE_TTL
      );
      ctx.translatedHash = crypto
        .createHash("sha256")
        .update(ctx.translated || "")
        .digest("hex");
    } catch (e) {
      console.error("Lỗi dịch thuật:", e.message);
      // Fallback: sử dụng văn bản gốc nếu dịch lỗi
      ctx.translated = ctx.text;
      ctx.translatedHash =
        ctx.textHash ||
        crypto
          .createHash("sha256")
          .update(ctx.translated || "")
          .digest("hex");
      ctx.translateCacheFallback = false;
    }
    ctx.translateFromCache = false;
    console.log("   -> Translate Cache miss, running translation.");
  }

  return ctx;
}
