import { ocrImageToText } from "../utils/ocr.js";

/**
 * Filter OCR – chuyển ảnh trong context thành văn bản
 * @param {object} ctx - Context pipeline
 * @property {Buffer} ctx.buffer - Dữ liệu ảnh
 * @property {string} [ctx.lang="eng+vie"] - Ngôn ngữ OCR
 * @returns {Promise<object>} - Context đã cập nhật ctx.text
 */
export async function OCRFilter(ctx) {
  if (!ctx?.buffer) {
    throw new Error("❌ OCRFilter: thiếu ctx.buffer (ảnh đầu vào).");
  }

  // ✅ fallback lang chuẩn
  const lang = ctx.lang || "eng+vie";

  ctx.text = await ocrImageToText(ctx.buffer, lang);
  return ctx;
}
