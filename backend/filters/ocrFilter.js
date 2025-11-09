import crypto from "crypto";
import { ocrImageToText } from "../utils/ocr.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

/**
 * Filter này thực hiện nhận dạng ký tự quang học (OCR) trên ảnh đầu vào.
 * Nó tích hợp logic cache: kiểm tra xem kết quả OCR đã tồn tại trong cache chưa,
 * nếu có thì dùng lại, nếu không thì chạy OCR và lưu kết quả vào cache.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với kết quả OCR.
 */
export async function OCRFilter(ctx) {
  if (!ctx?.buffer) {
    throw new Error("OCRFilter: thiếu ctx.buffer (ảnh đầu vào).");
  }

  const lang = ctx.lang || "eng+vie";

  // 1. Tạo cache key dựa trên nội dung ảnh và ngôn ngữ OCR
  const ocrKey = crypto
    .createHash("sha256")
    .update(ctx.buffer)
    .update(lang)
    .digest("hex");

  // 2. Kiểm tra cache
  const cachedText = await redisClient.get(ocrKey);

  if (cachedText) {
    // 3a. Cache hit: Sử dụng kết quả từ cache
    recordHit("ocr"); // Ghi nhận cache hit cho bước OCR
    ctx.text = cachedText;
    ctx.ocrFromCache = true; // Đánh dấu để biết kết quả này từ cache
    console.log("   -> OCR Cache hit.");
  } else {
    // 3b. Cache miss: Chạy OCR và lưu vào cache
    recordMiss("ocr"); // Ghi nhận cache miss cho bước OCR
    ctx.text = await ocrImageToText(ctx.buffer, lang);
    await redisClient.set(ocrKey, ctx.text); // Lưu kết quả vào Redis
    ctx.ocrFromCache = false;
    console.log("   -> OCR Cache miss, running OCR.");
  }

  return ctx;
}
