import { createRequire } from "module";

// Tạo hàm require để import các module CommonJS trong môi trường ES Module
const require = createRequire(import.meta.url);

// Import thư viện dịch. Cần xử lý .default để tương thích CJS/ESM.
const translateModule = require("@vitalets/google-translate-api");
const translate = translateModule.default || translateModule;

/**
 * Dịch một đoạn văn bản sang ngôn ngữ đích.
 *
 * @param {string} text - Văn bản cần dịch.
 * @param {string} [targetLang="vi"] - Mã ngôn ngữ đích (ví dụ: "vi", "en", "fr").
 * @returns {Promise<{translated: string, detected: string}>} - Một object chứa văn bản đã dịch và ngôn ngữ được phát hiện.
 */
export async function translateAuto(text, targetLang = "vi") {
  const res = await translate(text, { to: targetLang });
  return { translated: res.text, detected: res.from.language.iso };
}
