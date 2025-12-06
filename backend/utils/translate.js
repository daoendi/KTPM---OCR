// utils/translate.js
import * as OGT from "open-google-translator";
import { createRequire } from "module";
const require = createRequire(
    import.meta.url);

// Do thư viện @vitalets/google-translate-api có vấn đề với ES Modules (ESM),
// chúng ta sử dụng createRequire để nạp (import) nó như một module CommonJS (CJS).
// Đây là một giải pháp an toàn để đảm bảo tương thích.
let vitaletsCjs = null;
try {
    vitaletsCjs = require("@vitalets/google-translate-api");
} catch (_) {
    // Bỏ qua lỗi nếu thư viện chưa được cài đặt.
    vitaletsCjs = null;
}

/**
 * Dịch văn bản sử dụng nhiều thư viện dịch với cơ chế fallback để tăng độ tin cậy.
 * Ưu tiên: open-google-translator, sau đó fallback sang @vitalets/google-translate-api.
 *
 * @param {string} text - Văn bản cần dịch.
 * @param {string} [targetLang="vi"] - Mã ngôn ngữ đích (ví dụ: "vi", "en").
 * @param {string} [fromLang="auto"] - Mã ngôn ngữ nguồn ("auto" để tự động phát hiện).
 * @returns {Promise<string>} - Văn bản đã được dịch, hoặc văn bản gốc nếu tất cả các dịch vụ đều lỗi.
 */
export async function translateText(
    text,
    targetLang = "vi",
    fromLang = "auto"
) {
    if (!text || !text.trim()) return "";

    // Chuẩn hóa một số mã ngôn ngữ phổ biến.
    const normalized = { vie: "vi", eng: "en", fra: "fr", jp: "ja", kor: "ko" };
    targetLang = normalized[targetLang] || targetLang || "vi";
    fromLang = fromLang || "auto";

    // --- Helper function để tìm ra hàm `translate` đúng từ các kiểu export khác nhau của thư viện ---
    const resolveTranslateFunction = (mod) => {
        if (!mod) return null;
        if (typeof mod === "function") return mod;
        if (typeof mod.default === "function") return mod.default;
        if (typeof mod.translate === "function") return mod.translate;
        if (mod.default && typeof mod.default.translate === "function")
            return mod.default.translate;
        return null;
    };

    const ogtFn = resolveTranslateFunction(OGT);
    const vitaletsFn = resolveTranslateFunction(vitaletsCjs);

    // --- Helper function để thử dịch bằng `open-google-translator` với các chữ ký hàm khác nhau ---
    async function tryOGTOnce(t) {
        if (!ogtFn) return null;
        try {
            // Thử chữ ký: translate(text, from, to)
            const r1 = await ogtFn(t, fromLang, targetLang);
            if (r1 && (r1.translation || r1.text)) return r1.translation || r1.text;
        } catch (_) {}
        try {
            // Thử chữ ký: translate(text, { from, to })
            const r2 = await ogtFn(t, { from: fromLang, to: targetLang });
            if (r2 && (r2.translation || r2.text)) return r2.translation || r2.text;
        } catch (err) {}
        return null;
    }

    // --- Chia nhỏ văn bản dài thành các đoạn nhỏ hơn để tránh bị giới hạn ký tự của API dịch ---
    function chunkText(t, size = 4500) {
        const chunks = [];
        for (let i = 0; i < t.length; i += size) {
            chunks.push(t.slice(i, i + size));
        }
        return chunks;
    }

    const parts = chunkText(text);
    const translatedParts = [];

    for (const p of parts) {
        // 1. Ưu tiên sử dụng `open-google-translator`
        let translated = await tryOGTOnce(p);

        // 2. Nếu thất bại, fallback sang `@vitalets/google-translate-api`
        if (!translated && vitaletsFn) {
            try {
                const res = await vitaletsFn(p, { from: fromLang, to: targetLang });
                translated = res ?. text ?. p; // Nếu có kết quả thì lấy, không thì giữ nguyên
            } catch (err) {
                console.error("Lỗi dịch fallback (vitalets):", err.message);
                translated = p; // Giữ nguyên đoạn văn bản nếu cả hai thư viện đều lỗi
            }
        }

        translatedParts.push(translated ?. p);
    }

    // Nối các đoạn đã dịch lại thành một văn bản hoàn chỉnh.
    return translatedParts.join("");
}