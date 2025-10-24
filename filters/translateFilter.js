import { translateText } from "../utils/translate.js";

/**
 * Filter để dịch văn bản trong context.
 *
 * @param {object} ctx - Đối tượng context.
 * @property {string} ctx.text - Văn bản cần dịch.
 * @property {string} [ctx.targetLang] - Ngôn ngữ đích.
 * @returns {Promise<object>} - Context đã được cập nhật với `ctx.translated` và `ctx.detectedLang`.
 */
export async function TranslateFilter(ctx) {
  if (!ctx.text || ctx.text.trim() === "") return ctx;

  try {
    // Gọi hàm dịch và cập nhật context
    ctx.translated = await translateText(ctx.text, ctx.targetLang);
    ctx.detectedLang = "auto"; // Thư viện mới không trả về ngôn ngữ đã phát hiện
  } catch (e) {
    // Nếu có lỗi, giữ lại văn bản gốc
    console.error("Translate error:", e.message);
    ctx.translated = ctx.text;
    ctx.detectedLang = "unknown";
  }
  console.log("🔁 Đang chạy TranslateFilter...");
  console.log("➡️ Văn bản OCR:", ctx.text.slice(0, 100));

  return ctx;
}
