import { translateAuto } from "../utils/translate.js";

/**
 * Filter để dịch văn bản trong context.
 * Sử dụng hàm `translateAuto` để thực hiện việc dịch.
 *
 * @param {object} ctx - Đối tượng context. Cần chứa `ctx.text`.
 * @property {string} ctx.text - Văn bản cần dịch.
 * @property {string} [ctx.targetLang] - Ngôn ngữ đích.
 * @returns {Promise<object>} - Context đã được cập nhật với `ctx.translated` và `ctx.detectedLang`.
 */
export async function TranslateFilter(ctx) {
  // Bỏ qua nếu không có văn bản để dịch
  if (!ctx.text || ctx.text.trim() === "") return ctx;

  try {
    // Gọi hàm dịch
    const { translated, detected } = await translateAuto(
      ctx.text,
      ctx.targetLang
    );
    // Cập nhật context với kết quả
    ctx.translated = translated;
    ctx.detectedLang = detected;
  } catch (e) {
    console.error("Translate error:", e);
    // Nếu có lỗi, giữ lại văn bản gốc
    ctx.translated = ctx.text;
  }

  return ctx;
}
