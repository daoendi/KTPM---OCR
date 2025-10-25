import crypto from "crypto";
import { ocrImageToText } from "../utils/ocr.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const CACHE_TTL = process.env.CACHE_TTL || 3600;

/**
 * Filter OCR – chuyển ảnh trong context thành văn bản, có cache
 * @param {object} ctx - Context pipeline
 * @returns {Promise<object>} - Context đã cập nhật ctx.text
 */
export async function OCRFilter(ctx) {
  if (!ctx?.buffer) {
    throw new Error("OCRFilter: thiếu ctx.buffer (ảnh đầu vào).");
  }

  // Tạo ID duy nhất cho ảnh dựa trên nội dung
  const imageId = crypto.createHash("sha256").update(ctx.buffer).digest("hex");
  ctx.imageId = imageId; // Lưu lại để filter sau dùng
  const cacheKey = `ocr:${imageId}`;

  // Kiểm tra cache
  const cachedText = await redisClient.get(cacheKey);
  if (cachedText) {
    //console.log(`[Cache HIT] OCR: ${cacheKey}`);
    recordHit("ocr");
    ctx.text = cachedText;
    return ctx;
  }

  //console.log(`[Cache MISS] OCR: ${cacheKey}`);
  recordMiss("ocr");

  // Nếu không có cache, chạy OCR
  const lang = ctx.lang || "eng+vie";
  ctx.text = await ocrImageToText(ctx.buffer, lang);

  // Lưu kết quả vào cache
  await redisClient.set(cacheKey, ctx.text, "EX", CACHE_TTL);

  return ctx;
}
