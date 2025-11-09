import crypto from "crypto";
import { translateText } from "../utils/translate.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

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
    return ctx;
  }

  // 1. Tạo cache key dựa trên text và ngôn ngữ đích
  const translateKey = crypto
    .createHash("sha256")
    .update(ctx.text)
    .update(ctx.targetLang)
    .digest("hex");

  // 2. Kiểm tra cache
  const cachedTranslation = await redisClient.get(translateKey);

  if (cachedTranslation) {
    // 3a. Cache hit
    recordHit("translate");
    ctx.translated = cachedTranslation;
    ctx.translateFromCache = true;
    console.log("   -> Translate Cache hit.");
  } else {
    // 3b. Cache miss
    recordMiss("translate");
    try {
      ctx.translated = await translateText(ctx.text, ctx.targetLang);
      // Lưu kết quả vào cache chỉ khi dịch thành công
      await redisClient.set(translateKey, ctx.translated);
    } catch (e) {
      console.error("Lỗi dịch thuật:", e.message);
      // Fallback: sử dụng văn bản gốc nếu dịch lỗi
      ctx.translated = ctx.text;
    }
    ctx.translateFromCache = false;
    console.log("   -> Translate Cache miss, running translation.");
  }

  return ctx;
}
