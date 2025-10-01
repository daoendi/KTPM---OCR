import translate from "@vitalets/google-translate-api";

export async function translateText(text, targetLang = "vi") {
  if (!text || text.trim() === "") return "";
  try {
    const res = await translate(text, { to: targetLang });
    return res.text;
  } catch (e) {
    console.error("Translate error:", e);
    return text; // fallback: return nguyên văn
  }
}
