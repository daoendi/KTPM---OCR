// utils/translate.js
import * as OGT from "open-google-translator";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { createBreaker } from "./circuitBreaker.js";
import crypto from "crypto";
import { redisClient } from "./redisClient.js";
import { incr } from "./metrics.js";

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

  // Create breakers for translation libraries if available
  const ogtBreaker = ogtFn
    ? createBreaker(ogtFn, {
        name: "ogt",
        timeout: parseInt(process.env.CB_OGT_TIMEOUT || "8000", 10),
        errorThresholdPercentage: parseInt(
          process.env.CB_OGT_ERROR_THRESHOLD || "50",
          10
        ),
        resetTimeout: parseInt(process.env.CB_OGT_RESET_TIMEOUT || "30000", 10),
      })
    : null;

  const vitaletsBreaker = vitaletsFn
    ? createBreaker(vitaletsFn, {
        name: "vitalets",
        timeout: parseInt(process.env.CB_VITAL_TIMEOUT || "8000", 10),
        errorThresholdPercentage: parseInt(
          process.env.CB_VITAL_ERROR_THRESHOLD || "50",
          10
        ),
        resetTimeout: parseInt(
          process.env.CB_VITAL_RESET_TIMEOUT || "30000",
          10
        ),
      })
    : null;

  // --- Helper function để thử dịch bằng `open-google-translator` với các chữ ký hàm khác nhau ---
  async function tryOGTOnce(t) {
    if (!ogtFn) return null;
    try {
      // Use circuit breaker if available
      if (ogtBreaker) {
        const r1 = await ogtBreaker.fire(t, fromLang, targetLang);
        if (r1 && (r1.translation || r1.text)) return r1.translation || r1.text;
      } else {
        const r1 = await ogtFn(t, fromLang, targetLang);
        if (r1 && (r1.translation || r1.text)) return r1.translation || r1.text;
      }
    } catch (_) {}
    try {
      if (ogtBreaker) {
        const r2 = await ogtBreaker.fire(t, { from: fromLang, to: targetLang });
        if (r2 && (r2.translation || r2.text)) return r2.translation || r2.text;
      } else {
        const r2 = await ogtFn(t, { from: fromLang, to: targetLang });
        if (r2 && (r2.translation || r2.text)) return r2.translation || r2.text;
      }
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
  let cacheFallbackUsed = false;

  for (const p of parts) {
    // 1. Ưu tiên sử dụng `open-google-translator`
    let translated = null;
    try {
      translated = await tryOGTOnce(p);
    } catch (e) {
      // tryOGTOnce may throw if breaker rejects; we'll handle below
      translated = null;
    }

    // 2. Nếu thất bại, fallback sang `@vitalets/google-translate-api`
    if (!translated && vitaletsFn) {
      try {
        if (vitaletsBreaker) {
          const res = await vitaletsBreaker.fire(p, {
            from: fromLang,
            to: targetLang,
          });
          translated = res?.text ?? p;
        } else {
          const res = await vitaletsFn(p, { from: fromLang, to: targetLang });
          translated = res?.text ?? p;
        }
      } catch (err) {
        console.error("Lỗi dịch fallback (vitalets):", err?.message || err);
        // If breakers failed, try cached translation before falling back to original text
        try {
          const textHash = crypto.createHash("sha256").update(p).digest("hex");
          const key = `ocr:trans:${textHash}:${targetLang}`;
          const cached = await redisClient.get(key);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed && parsed.translatedText) {
                console.info(
                  "Translation breaker fallback: returning cached translation"
                );
                translated = parsed.translatedText;
                cacheFallbackUsed = true;
                try {
                  incr("cache_fallback_count");
                } catch (e) {}
              }
            } catch (parseErr) {
              // cached could be plain string
              translated = String(cached);
              cacheFallbackUsed = true;
              try {
                incr("cache_fallback_count");
              } catch (e) {}
            }
          }
        } catch (cacheErr) {
          console.warn(
            "Translation cache fallback failed:",
            cacheErr?.message || cacheErr
          );
        }

        if (!translated) translated = p; // final fallback: original text
      }
    }

        translatedParts.push(translated ?. p);
    }

  // Nối các đoạn đã dịch lại thành một văn bản hoàn chỉnh.
  const finalText = translatedParts.join("");
  if (cacheFallbackUsed) {
    return { translatedText: finalText, cacheFallback: true };
  }
  return finalText;
}
