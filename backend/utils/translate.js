// utils/translate.js
import * as OGT from "open-google-translator";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Nạp bản CJS của @vitalets/google-translate-api để tránh ESM interop lỗi
let vitaletsCjs = null;
try {
  vitaletsCjs = require("@vitalets/google-translate-api"); // CJS: module.exports = fn
} catch (_) {
  vitaletsCjs = null;
}

/**
 * Dịch một đoạn văn bản sang ngôn ngữ đích sử dụng open-google-translator.
 *
 * @param {string} text - Văn bản cần dịch.
 * @param {string} [targetLang="vi"] - Mã ngôn ngữ đích (ví dụ: "vi", "en", "fr").
 * @param {string} [fromLang="auto"] - Mã ngôn ngữ nguồn. Mặc định là "auto" để tự động phát hiện.
 * @returns {Promise<string>} - Văn bản đã được dịch, hoặc văn bản gốc nếu có lỗi.
 * @throws {Error} - Ném lỗi nếu quá trình dịch gặp sự cố.
 */
export async function translateText(
  text,
  targetLang = "vi",
  fromLang = "auto"
) {
  if (!text || !text.trim()) return "";

  const normalized = { vie: "vi", eng: "en", fra: "fr", jp: "ja", kor: "ko" };
  targetLang = normalized[targetLang] || targetLang || "vi";
  fromLang = fromLang || "auto";

  // ---- Resolve open-google-translator function (nhiều kiểu export khác nhau)
  const resolveOGT = (mod) => {
    if (!mod) return null;
    if (typeof mod === "function") return mod;
    if (typeof mod.default === "function") return mod.default;
    if (typeof mod.translate === "function") return mod.translate;
    if (mod.default && typeof mod.default.translate === "function")
      return mod.default.translate;
    return null;
  };
  const ogtFn = resolveOGT(OGT);

  // ---- Resolve Vitalets fn từ CJS (an toàn nhất)
  const resolveVitalets = (mod) => {
    if (!mod) return null;
    if (typeof mod === "function") return mod; // module.exports = fn
    if (typeof mod.default === "function") return mod.default; // đôi khi đóng trong default
    if (typeof mod.translate === "function") return mod.translate;
    return null;
  };
  const vitaletsFn = resolveVitalets(vitaletsCjs);

  // ---- Helper: dịch 1 đoạn bằng OGT với 2 chữ ký phổ biến
  async function tryOGTOnce(t) {
    if (!ogtFn) return null;
    try {
      const r1 = await ogtFn(t, fromLang, targetLang);
      if (typeof r1 === "string") return r1;
      if (r1 && (r1.translation || r1.text)) return r1.translation || r1.text;
    } catch (_) {
      // ignore và thử chữ ký khác
    }
    try {
      const r2 = await ogtFn(t, { from: fromLang, to: targetLang });
      if (typeof r2 === "string") return r2;
      if (r2 && (r2.translation || r2.text)) return r2.translation || r2.text;
    } catch (err) {
      // Thả cho fallback Vitalets xử lý
      // console.warn("OGT failed:", err.message);
    }
    return null;
  }

  // ---- Chia nhỏ văn bản dài để tránh giới hạn ẩn
  function chunkText(t, size = 4500) {
    const out = [];
    for (let i = 0; i < t.length; i += size) out.push(t.slice(i, i + size));
    return out;
  }

  const parts = chunkText(text);
  const out = [];

  for (const p of parts) {
    // 1) Ưu tiên OGT
    let translated = await tryOGTOnce(p);

    // 2) Fallback Vitalets (CJS)
    if (!translated && vitaletsFn) {
      try {
        const res = await vitaletsFn(p, { from: fromLang, to: targetLang });
        translated = res?.text ?? p;
      } catch (err) {
        console.error("❌ Translate fallback error (vitalets):", err.message);
        translated = p; // giữ nguyên đoạn nếu cả hai cùng lỗi
      }
    }

    out.push(translated ?? p);
  }

  return out.join("");
}
