import translator from "open-google-translator";

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
  if (!text || text.trim() === "") return "";

  if (!text || text.trim() === "") return "";

  const normalized = { vie: "vi", eng: "en", fra: "fr" };
  targetLang = normalized[targetLang] || targetLang;

  try {
    const data = await translator.TranslateLanguageData({
      listOfWordsToTranslate: [text],
      fromLanguage: fromLang,
      toLanguage: targetLang,
    });
    if (!data || !data[0]) {
      console.warn("⚠️ Google Translator trả về rỗng, fallback sang text gốc.");
      return text;
    }

    console.log(`🌐 Dịch thành công → ${targetLang}`);
    return data[0].translation || text;
  } catch (err) {
    console.error("❌ Translate error:", err.message);
    return text;
  }
}
