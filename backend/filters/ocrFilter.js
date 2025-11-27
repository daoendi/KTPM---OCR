import crypto from "crypto";
import { ocrImageToText } from "../utils/ocr.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const OCR_TEXT_CACHE_TTL = parseInt(process.env.CACHE_TEXT_TTL || "604800", 10); // default 7 days

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
  const preprocessedBuffer = ctx.preprocessedBuffer || ctx.buffer;
  if (!ctx.preprocessedHash) {
    ctx.preprocessedHash = crypto
      .createHash("sha256")
      .update(preprocessedBuffer)
      .digest("hex");
  }

  const ocrKey = `ocr:text:${ctx.preprocessedHash}:${lang}`;
  const cachedPayload = await redisClient.get(ocrKey);

  if (cachedPayload) {
    recordHit("ocr");
    let payload;
    try {
      payload = JSON.parse(cachedPayload);
    } catch (err) {
      payload = { text: cachedPayload, meta: {} };
    }
    ctx.text = payload.text;
    ctx.ocrMeta = payload.meta;
    ctx.ocrFromCache = true;
    console.log("   -> OCR Cache hit.");
  } else {
    recordMiss("ocr");
    const text = await ocrImageToText(preprocessedBuffer, lang, {
      preprocessed: Boolean(ctx.preprocessedBuffer),
    });
    ctx.text = text;
    ctx.ocrMeta = { langDetected: lang };
    ctx.ocrFromCache = false;
    try {
      await redisClient.set(
        ocrKey,
        JSON.stringify({ text, meta: ctx.ocrMeta }),
        "EX",
        OCR_TEXT_CACHE_TTL
      );
    } catch (err) {
      console.error("Failed to cache OCR text", err);
    }
    console.log("   -> OCR Cache miss, running OCR.");
  }

  ctx.textHash = crypto.createHash("sha256").update(ctx.text).digest("hex");

  return ctx;
}
