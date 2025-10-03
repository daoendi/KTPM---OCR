import { ocrImageToText } from "../utils/ocr.js";

/**
 * Filter để nhận dạng văn bản từ hình ảnh (OCR).
 *
 * @param {object} ctx - Đối tượng context. Cần chứa `ctx.buffer`.
 * @property {Buffer} ctx.buffer - Dữ liệu buffer của hình ảnh.
 * @property {string} [ctx.lang="eng"] - Ngôn ngữ của văn bản trong ảnh.
 * @returns {Promise<object>} - Context đã được cập nhật với `ctx.text`.
 */
export async function OCRFilter(ctx) {
  // Gọi hàm OCR và lưu kết quả vào context
  ctx.text = await ocrImageToText(ctx.buffer, ctx.lang || "eng");
  return ctx;
}
